import { Schema, model, models } from "mongoose";
import { COUNTRY_OPTIONS } from "@/lib/country-config";

/**
 * One trip-assistant chat, kept so it survives a reload and follows the
 * account to other devices. See docs/AI_ASSISTANT_V2_PLAN.md.
 *
 * A chat belongs to the country it was started in. Its messages carry the
 * cards that were shown with them, and `context` holds what the next turn
 * needs: the places already chosen in the chat and the trip it is about.
 *
 * Deleted 30 days after the last message (TTL on `updatedAt`), and with the
 * account (lib/account-cleanup.ts).
 */

export const ASSISTANT_CHAT_RETENTION_SECONDS = 30 * 24 * 60 * 60;

const MessageSchema = new Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, default: "" },
    cards: { type: [Schema.Types.Mixed], default: [] },
    suggestions: { type: [Schema.Types.Mixed], default: [] },
    // An error or a stopped turn, shown in the chat but never sent to the
    // model as history.
    error: { type: Boolean, default: false },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const AssistantConversationSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    country: { type: String, enum: COUNTRY_OPTIONS, required: true },
    title: { type: String, required: true },
    messages: { type: [MessageSchema], default: [] },
    messageCount: { type: Number, default: 0 },
    context: {
      resolvedPlaces: { type: Schema.Types.Mixed, default: {} },
      currentTrip: { type: Schema.Types.Mixed, default: null },
    },
  },
  { timestamps: true, minimize: false },
);

AssistantConversationSchema.index({ userId: 1, country: 1, updatedAt: -1 });
AssistantConversationSchema.index({ updatedAt: 1 }, { expireAfterSeconds: ASSISTANT_CHAT_RETENTION_SECONDS });

export default models.AssistantConversation || model("AssistantConversation", AssistantConversationSchema);
