import { load, requirePackage } from "./load.mjs";

// Real storage functions over an in-memory collection. No network or database.
export function assistantStore() {
  const mongoose = requirePackage("mongoose");
  const docs = [];
  const matches = (doc, filter) => Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === "object") {
      if ("$in" in value) return value.$in.some((id) => String(id) === String(doc[key]));
      if ("$lte" in value) return doc[key] <= value.$lte;
    }
    return String(doc[key]) === String(value);
  });
  const query = (items, single = false) => ({
    items,
    sort(order) {
      const [key, direction] = Object.entries(order)[0];
      this.items.sort((a, b) => direction * (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0));
      return this;
    },
    select() { return this; },
    limit(n) { this.items = this.items.slice(0, n); return this; },
    async lean() { return structuredClone(single ? this.items[0] ?? null : this.items); },
  });
  const model = {
    find: (filter) => query(docs.filter((doc) => matches(doc, filter))),
    findOne: (filter) => query(docs.filter((doc) => matches(doc, filter)), true),
    async create(input) {
      const doc = { _id: String(new mongoose.Types.ObjectId()), messages: [], messageCount: 0,
        context: { resolvedPlaces: {}, currentTrip: null }, createdAt: new Date(), updatedAt: new Date(), ...input };
      docs.push(doc);
      return structuredClone(doc);
    },
    async deleteMany(filter) {
      const matching = docs.filter((doc) => matches(doc, filter));
      for (const doc of matching) docs.splice(docs.indexOf(doc), 1);
      return { deletedCount: matching.length };
    },
    async deleteOne(filter) { return this.deleteMany(filter); },
    async updateOne(filter, update) {
      const doc = docs.find((item) => matches(item, filter));
      if (!doc) return { matchedCount: 0 };
      doc.messages.push(...structuredClone(update.$push.messages.$each));
      doc.messages.sort((a, b) => a.createdAt - b.createdAt);
      doc.messageCount += update.$inc.messageCount;
      Object.assign(doc, structuredClone(update.$set), { updatedAt: new Date() });
      return { matchedCount: 1 };
    },
  };
  const mocks = { mongoose, "@/lib/mongodb": async () => {}, "@/models/AssistantConversation": model };
  return { docs, model, storage: load("lib/assistant/conversations.ts", mocks), mocks };
}
