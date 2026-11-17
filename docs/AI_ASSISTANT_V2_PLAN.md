# Trip assistant v2: saved chats — implementation plan

Makes trip-assistant chats survive a page reload and follow the account to
other devices. Builds on [AI_ASSISTANT_PLAN.md](AI_ASSISTANT_PLAN.md).
Written 2026-11-16 and revised 2026-11-17, before any code.

**Voice input is not part of this version.** It was planned and then dropped
on 2026-11-17. The microphone stays blocked by the app's
`Permissions-Policy`, as it is today. If voice comes back, see "Voice, if it
returns" at the end.

## Status (2026-11-17): built and tested

**Checks:** all steps are done. `pnpm test` (225 tests, 26 of them for saved
chats, streaming, Stop and next steps), `pnpm lint`, `tsc --noEmit` and
`pnpm build` pass. Codex built part of this alongside Claude; its storage
changes were kept: pruning after creation so simultaneous new chats can't
overflow, the 50-message cap enforced inside the write, messages ordered by
request start, a 45-second turn deadline, and cancellation passed on to the
internal route and fare calls.

**Live check:** headless Chromium, a dev server with Mailjet blanked, and
three throwaway accounts, all deleted. Each deletion was confirmed in the
database as 0 chats left, and the real collection has the 30-day TTL index.
All of the following passed:
- **Streaming:** the first answer streamed in 15 pieces before the final
  reply, which matched the streamed text.
- **Reload:** the chat was restored with its card, "Prices from …", Refresh
  and the next-step buttons.
- **Follow-ups:** "make it 3 people" used the stored trip. "Cheapest ride"
  re-sorted the card. Refresh on an old card added a fresh one.
- **Stop:** it ended the turn, and "Stopped." survived a reload.
- **Second device:** a second browser profile on the same account saw the
  whole chat and continued it; the first device then saw that message.
- **Recent chats:** listed, opened an older chat, and deleted one.
- **Country switch:** the UK showed its own empty chat with London examples;
  switching back restored the Bangladesh chat.
- **"Add a stop…":** filled the box and focused it.

**Fixed after the live check:**
- **Stopped turns stayed in history.** A stopped (or failed) request's own
  message was still sent to the model, so the next message ("Show the fares
  for route 2") planned the abandoned trip. A failed or stopped turn is now
  left out whole. There is a unit test, and it was rechecked live: route 2 of
  the right trip.
- **"Add a stop…" was squeezed out.** It is now always offered, last, after
  up to three other next steps, while the trip has room for a stop.

**Spend for the live check:** 10 completed messages and 20 model calls,
about $0.004.

## Decisions already made

| Topic | Decision |
|---|---|
| Chat history | **Always on.** Every chat is stored against the account; there is no opt-out |
| Retention | Chats are deleted 30 days after their last message. At most 20 chats per user and 50 messages per chat |
| Scope per country | A chat belongs to the country it was started in, like saved trips. The panel shows chats for the current country only |
| Voice | Not now |
| Also in this version (agreed 2026-11-17) | Suggested next steps under each trip card, a Stop button while the assistant answers, and replies that appear word by word |

## How it changes

Today the browser holds the conversation and sends the whole history with
each message, and nothing is stored. After this change:

```
Panel (any device) ──POST /api/assistant { conversationId?, message, pick?, focusTrip? }──► server
                                                                                  │ 1. load the chat (owner + country checked)
                                                                                  │ 2. history = its last 12 text messages
                                                                                  │ 3. run the turn (unchanged loop)
                                                                                  │ 4. append the user message, reply and cards
◄── stream: conversation · status · card · reply · error · done ───────────────────┘
```

- **The server becomes the source of truth.** The browser sends only the new
  message and the chat id. It no longer sends history or context, so a
  tampered browser can't feed the model a fake history or a fake current trip.
- **Places and the current trip are stored with the chat.** Chosen places,
  remembered places and the current trip live with the chat, so a follow-up
  ("make it 4 people") works after a reload or on another device.
- **Picking a place from chips** sends `pick: { query, place }`. The server
  checks the place (valid coordinates, inside the service area) and adds it
  to the chat's remembered places before the turn runs. This replaces today's
  client-side `resolvedPlaces`.

## Data: `models/AssistantConversation.ts`

```ts
{
  userId: string,            // indexed
  country: "BD" | "UK" | "US",
  title: string,             // the first user message, 60 chars
  messages: [{
    role: "user" | "assistant",
    text: string,            // ≤ 1,000 chars (user) / 600 (assistant)
    cards: Mixed[],          // trip and place-choice cards, as streamed
    error: boolean,          // an error shown instead of a reply
    createdAt: Date,
  }],
  context: { resolvedPlaces: Mixed, currentTrip: Mixed },
  createdAt, updatedAt,      // TTL index on updatedAt: 30 days
}
```

- **Size:** a trip card is about 3–5 KB, so a full 50-message chat stays well
  under 1 MB.
- **20 chats per user:** starting a 21st deletes the oldest.
- **50 messages per chat:** a full chat answers "This chat is full. Start a
  new chat." without calling the model.
- **Writes:** a turn's results are written with one atomic update at the end.
  If two tabs send at once, both messages are kept, in arrival order.
- **Errors are stored as error messages**, so a reload shows what happened.
  They are never sent to the model as history.

## Endpoints

| Endpoint | Does |
|---|---|
| `POST /api/assistant` | As today, but with `{ conversationId?, message, pick?, focusTrip? }`. With no id, it creates a chat in the user's current country. The first stream event is `{ type: "conversation", id, title }`. A chat from another country answers 409: "This chat is from another country. Start a new chat." |
| `GET /api/assistant/conversations` | The current country's chats, newest first: `{ id, title, updatedAt, messageCount }`, at most 20 |
| `GET /api/assistant/conversations/[id]` | One chat with its messages and cards, for the owner only (404 for anyone else) |
| `DELETE /api/assistant/conversations/[id]` | Deletes one chat, for the owner only |

All of these require sign-in and use the same per-user limits pattern as the
other endpoints.

## Old cards: prices are a snapshot

A restored trip card shows **"Prices from Mon 16 Nov, 9:41 pm"**, from its
message time, with a **Refresh** button.

- **Refresh** sends `focusTrip: { tripHistoryId, routeId }`. The server finds
  that trip in the chat's own stored cards (never trusting the browser),
  makes it the current trip, and asks for its fares again. That is one model
  call.
- **Save, Open in planner and All fares** keep working on old cards, because
  they point at the stored trip.

## Panel changes

- **On open:** the panel resumes the most recent chat for the current country
  and shows its messages and cards.
- **Header:** a **Recent chats** button opens a list of title, relative time
  and a delete button. Picking a chat loads it. **New chat** starts an empty
  chat; the server creates it with the first message.
- **Deleting the open chat** shows the empty state.
- **Country switch:** the panel switches to that country's latest chat. Chats
  from the other country are not deleted; they come back when you switch
  back.
- **Loading:** a short skeleton while the chat loads, and an error with
  **Try again** if it fails.

## Privacy and data handling

- **Account deletion** removes every chat. One more `deleteMany` in
  [lib/account-cleanup.ts](../lib/account-cleanup.ts), with a test.
- **The backup script** includes the new collection automatically; it backs
  up every collection.
- **Panel note:** "Chats are saved to your account for 30 days. Messages are
  processed by Ollama Cloud." It replaces "Messages are processed by Ollama
  Cloud."
- **Docs:** [demo-operations.md](demo-operations.md) and the README say chats
  are stored for 30 days. Logs still never contain messages.

## Files

| New | Purpose |
|---|---|
| `models/AssistantConversation.ts` | Chat storage, with the TTL index |
| `lib/assistant/conversations.ts` | Load (owner + country), create, append a turn, list, delete; caps; history and context rebuilt from stored messages |
| `app/api/assistant/conversations/route.ts` | List |
| `app/api/assistant/conversations/[id]/route.ts` | Get and delete |
| `components/assistant/ChatList.tsx` | The Recent chats list |

| Changed | Change |
|---|---|
| `app/api/assistant/route.ts` | New request shape; load and store the chat; `conversation` event; 409 for another country; full-chat answer |
| `lib/assistant/request.ts` | Reads `{ conversationId, message, pick, focusTrip }` instead of history and context |
| `lib/assistant/types.ts` | `conversation` event; stored-message and chat-summary types |
| `components/assistant/AssistantLauncher.tsx` | Resume on open, Recent chats, delete, the new privacy note |
| `components/assistant/AssistantCards.tsx` | "Prices from …" and Refresh on restored trip cards |
| `lib/account-cleanup.ts` | Delete the user's chats |
| `docs/demo-operations.md`, `README.md` | Chat storage and retention |

No new npm packages and no new provider.

## Steps

Each step leaves the app working and passes `pnpm test`, `pnpm lint` and
`tsc --noEmit`.

### Step 1: Storage
Write the model, the TTL index, `lib/assistant/conversations.ts` with its
caps, and deletion on account deletion.
**Done when:** unit tests cover create, append, list (current country only,
20 max, newest first), the oldest chat deleted at 21, the full-chat answer at
50, owner-only get and delete, history built from text only (errors left
out), and account deletion removing chats.

### Step 2: Endpoint on stored chats
Switch `POST /api/assistant` to the new request shape. It loads and creates
chats, applies `pick` and `focusTrip` on the server, appends results
atomically, and emits the `conversation` event.
**Done when:**
- Tests cover a new chat created on the first message, a follow-up after a
  "reload" (a new request with only the id) that keeps the current trip, a
  pick validated and remembered, and `focusTrip` taken from stored cards
  only.
- Another user's chat id answers 404, and another country's answers 409.
- The old `messages`/`context` body is rejected with 400.

### Step 3: List, get and delete endpoints
**Done when:** tests cover owner-only access, the country filter, and
deletion.

### Step 4: Panel with saved chats
Resume on open, Recent chats, New chat, delete, the country switch, loading
and error states, and the snapshot label with Refresh on old cards.
**Done when:** a reload restores the chat with its cards and a follow-up
works; a second browser signed in to the same account sees the same chats.

### Step 4b: Next steps, Stop, word by word
Streamed model calls with `delta`/`reset`, follow-up buttons from code, and
Stop with server-side cancellation.
**Done when:** tests cover streaming parse (including string-encoded tool
calls), reset when text precedes a tool call, follow-ups chosen and
deduplicated, and a stopped turn stored as stopped. Live: text appears before
the turn ends, Stop ends a turn, and a next-step button runs.

### Step 5: Docs and privacy text
Update the panel note, the README, `demo-operations.md`, and the step
statuses here.

### Step 6: Live check
Use headless Chromium and a throwaway account deleted afterwards, as before.

1. Start a chat, reload, and confirm it's restored with its cards. Then a
   follow-up ("make it 3 people") uses the stored trip.
2. A second browser profile signed in to the same account sees the same chat
   and can continue it.
3. Recent chats: switch between two chats, delete one, start a new one.
4. Switching country shows that country's chats; switching back restores
   the first.
5. An old card shows "Prices from …"; Refresh re-prices it.
6. Account deletion removes the chats (checked through the API afterwards).

## Cost

- **Saved chats add no model calls.** History is still capped at the last 12
  messages, so each message costs the same as today, about $0.0003.
- **Refresh** costs one more model call when pressed.
- **Database storage** at the caps is at most about 20 MB per 1,000 active
  users.

## Out of scope

- Voice input (see below).
- Sharing a chat with another person.
- Searching across chats.

## Also in this version (from Q Cosmetics)

- **Suggested next steps.** Buttons under the latest trip card are chosen in
  code from what the card shows: "Cheapest ride" (unless it is already sorted
  that way), "Show route 2" (when there is one), "Leave in an hour" (when
  leaving now), "Return trip", and "Add a stop…", which fills the box for the
  user to finish. At most four are shown, and anything already asked in the
  chat is skipped. Pressing one sends it like a typed message. They are
  stored with the reply, so they come back after a reload.
- **Stop.** While the assistant answers, Send becomes Stop. Stop aborts the
  request: the server cancels the model call and stores the user's message
  with a "Stopped" note (not sent to the model as history). Any card already
  shown is kept.
- **Word by word.** Model calls are streamed (`stream: true`) and the reply
  text appears as it is written. Text written before a tool call is
  withdrawn with a `reset` event. When the reply is complete, a final `reply`
  event carries the cleaned text (markup stripped, two sentences), which
  replaces what was streamed. Stream events gain `delta`, `reset` and
  `suggestions`.

## Voice, if it returns

The sibling project `q-cosmetics-ai` already solved this, so follow it rather
than the browser's speech recognition:

1. **Recording:** record with `MediaRecorder` and convert to 16 kHz mono WAV
   in the browser, so the format is the same in every browser, Firefox and
   iPhone included.
2. **Transcription:** send the audio to a server endpoint, which transcribes
   it through OpenRouter (`google/gemini-3.5-transcribe`). It was the most
   accurate of eight models on Bangla there; Whisper returned empty text for
   Bangla, and Ollama Cloud can't take audio. It needs an
   `OPENROUTER_API_KEY` in this project's `.env` and is billed per
   recording.
3. **No language switch:** the model detects Bangla or English itself.
4. **Recording screen:** a level meter, a 110-second cap, Discard and Send,
   and clear messages for a blocked mic, a missing mic, no speech, and no
   credit.
5. **The model is told the message was spoken**, so it asks about a misheard
   place rather than guessing.
6. **Microphone permission:** change `microphone=()` to `microphone=(self)`
   in `next.config.ts`, and update `tests/auth-guards.test.mjs` to match.

## Risks

| Risk | Mitigation |
|---|---|
| Stored chats contain place names users typed | 30-day retention, deletion with the account, owner-only access, never logged |
| Old card prices look current | "Prices from …" label and Refresh |
| Two tabs writing to one chat | Atomic appends; both messages kept |
| A chat from another country continued after a switch | Chats are scoped to their country; the endpoint answers 409 |
