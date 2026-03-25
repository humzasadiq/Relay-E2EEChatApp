# Relay — E2EE Chat Web App · Study Project Plan

> Goal: a working E2EE chat that's **easy to build, easy to explain, and easy to grade**. We optimize for clarity over production-grade crypto. Where we cut a corner, we say so out loud.

---

## 1. Architecture (one picture)

```
Next.js (client)  ──HTTP──►  NestJS REST  ──►  Prisma ──►  Postgres (Neon)
      │                         │
      └──── Socket.io (WSS) ────┘
                │
         WebRTC signaling only
                ▼
        Browser ◄──P2P──► Browser   (audio/video never touches server)

Cloudinary: client uploads already-encrypted blobs. Server stores the URL.
```

Three things to remember:
1. **Server relays ciphertext.** It never sees plaintext messages or media.
2. **Socket.io does double duty**: chat messages *and* WebRTC signaling.
3. **WebRTC media is P2P**, so no media server to run.

---

## 2. E2EE — keep it simple (libsodium)

We are **not** using Signal Protocol or MLS. Too much complexity for a study project and the added security properties (forward secrecy, post-compromise security) aren't graded.

### The scheme

Per user (generated in the browser on signup):
- `Ed25519` identity keypair (sign/verify)
- `X25519` keypair (key exchange)
- Public keys go to the server. Private keys stay in **IndexedDB**, wrapped with a key derived from the user's password via `argon2id`.

Per conversation:
- One random **AES-256-GCM** conversation key.
- The sender wraps it once per member using `X25519 ECDH + HKDF → AES-KW`.
- Wrapped keys live in the DB as `ConversationKey { userId, conversationId, wrappedKey }`.
- Rotate the conversation key whenever membership changes.

Per message:
- `ciphertext = AES-256-GCM(conversationKey, plaintext, nonce=random12)`
- Server stores `{ ciphertext, nonce, senderId, createdAt }`. That's it.

### Media

1. Client generates a random AES key, encrypts the file.
2. Client uploads ciphertext to Cloudinary via a signed URL.
3. Client sends a normal chat message whose plaintext is `{ cloudinaryUrl, fileKey, mime, size }`.
4. Recipient decrypts the message, fetches the blob, decrypts with `fileKey`.

### What we *don't* do (and we'll say so in the README)

- No forward secrecy (one leaked key = all history readable).
- No multi-device (one browser = one identity).
- Metadata (who talks to whom, when, message size) is visible to the server.

### Library: `libsodium-wrappers`

Single dependency, works in browser + Node, well-documented. Everything we need (`crypto_box`, `crypto_secretbox`, `crypto_pwhash`, `crypto_sign`) is a one-liner.

---

## 3. Tech choices (locked in)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 16 + Tailwind | Already scaffolded. App router. |
| Backend | NestJS 11 | Already scaffolded. Built-in DI + WS. |
| DB | Postgres (Neon) + Prisma | Free tier, typed client, painless migrations. |
| Realtime | Socket.io | De-facto standard; first-class NestJS adapter. |
| Auth | JWT (email + password) | Passport local + JWT strategy. No third-party OAuth. |
| Crypto | `libsodium-wrappers` | One dep, covers everything. |
| Media | Cloudinary signed uploads | No server-side proxy needed. |
| Calls | WebRTC 1:1 + Google STUN | No TURN server to run. Mesh group calls deferred. |

---

## 4. Data Model (Prisma sketch)

```prisma
User            id, email, displayName, avatarUrl, passwordHash?, createdAt
KeyBundle       userId @unique, identityPubKey, exchangePubKey,
                wrappedPrivateKeys  // encrypted blob, server never unwraps

Conversation    id, type (DIRECT|GROUP), name?, createdAt
Membership      userId, conversationId, role, joinedAt
ConversationKey userId, conversationId, wrappedKey  // this user's copy

Message         id, conversationId, senderId, ciphertext, nonce, createdAt
MediaAsset      id, messageId, cloudinaryUrl, mime, size  // plaintext metadata only

Session         userId, refreshTokenHash, expiresAt
```

The server could read every column here and still not read a single message.

---

## 5. Design Patterns

Six patterns, each tied to a real problem. Written in the Without / Implementation / Benefit format so it maps straight to the writeup.

### 1. Strategy Pattern — `ChatStorageStrategy`

**Without this pattern:** chat persistence logic is hard-wired to Prisma. Running the app without a database (demo, offline, "Temporary Chat" mode) requires commenting out code or duplicating the chat service.

**Implementation:** define a single `ChatStorageStrategy` interface (`saveMessage`, `loadHistory`, `createConversation`, `addMember`, …). Two implementations live behind it:
- `DatabaseChatStrategy` — Prisma-backed, durable.
- `InMemoryChatStrategy` — plain `Map`s, wiped on restart.

A factory provider in `ChatModule` picks one at runtime:

```
if (!process.env.DATABASE_URL)          → InMemoryChatStrategy
else if (socket.handshake.query.mode === 'temporary') → InMemoryChatStrategy
else                                    → DatabaseChatStrategy
```

The UI exposes a **"Temporary Chat"** toggle on conversation creation. Temporary chats never hit Postgres — ciphertext lives only in the server's memory and the clients' IndexedDB, and it's gone on server restart.

**Benefit:** the whole app still runs with zero database configuration — perfect for graders, demos, and offline development. Swapping storage is a one-line provider change, and the rest of the codebase (gateway, controllers, factory) doesn't know which strategy is active.

### 2. Decorator Pattern

**Without this pattern:** middleware clutters routing logic. Definitions become a long chain of functions (parsing, auth checks, user extraction), reducing readability.

**Implementation:** TypeScript metadata decorators — `@UseGuards(JwtAuthGuard)` for security, custom `@CurrentUser()` to extract JWT payload cleanly, `@Injectable()` for DI.

**Benefit:** core business logic stays pristine. Security and routing concerns are applied transparently without altering the underlying function body.

### 3. Observer Pattern (Pub/Sub)

**Without this pattern:** handling thousands of concurrent socket events (typing, messages, presence) synchronously leads to blocking operations and UI latency.

**Implementation:** a reactive architecture using **RxJS streams** and **Event Emitters**. Services publish events (`message.created`, `user.typing`, `call.incoming`) to subjects. WebSocket gateways act as observers and broadcast to the relevant rooms.

**Benefit:** decouples database/storage operations from WebSocket broadcasting. The UI stays reactive under load and new subscribers (notifications, unread badges, analytics) can plug in without touching the publisher.

### 4. Singleton Pattern

**Without this pattern:** accidentally establishing multiple database connection pools or duplicated utility instances causes severe memory leaks and connection exhaustion.

**Implementation:** NestJS providers act as strict singletons. `PrismaService` instantiates exactly once on boot; every controller accesses the same global instance. On the client, `KeyStore` is a module-scoped singleton so all React components share the in-memory key cache.

**Benefit:** one optimized connection pool to the database, one source of truth for keys in the browser — no connection exhaustion, no desynced caches.

### 5. Factory Pattern — `MessageFactory`

**Without this pattern:** the gateway has a sprawling `switch` on message `type` with inline validation for every variant, and adding a new message type means editing three files.

**Implementation:** `MessageFactory.create(type, payload)` returns a concrete `TextMessage`, `MediaMessage`, or `SystemMessage`, each with its own validation and serialization.

**Benefit:** one place to add a new message variant. The gateway just calls the factory and forwards the result.

### 6. Builder Pattern — `MessageBuilder`

**Without this pattern:** constructing a message on the client means calling a constructor with 6+ optional arguments (`text`, `attachment`, `replyTo`, `recipients`, `nonce`, `conversationKey`) in a fixed order — unreadable and error-prone.

**Implementation:** a fluent builder on the client:

```ts
await new MessageBuilder()
  .text('hello')
  .attach(file)
  .replyTo(messageId)
  .encryptFor(conversationKey)
  .build();
```

**Benefit:** readable call sites, validation happens in `.build()`, and encryption is guaranteed to be the last step before transport.

---

We **skip Prototype** — no honest use case here. Better to use 6 patterns well than force a 7th.

---

## 6. Build Order (suggested 7 milestones)

Each milestone ends with something demoable.

1. **M0 · Foundations** — Prisma + Neon connected, NestJS modules (`auth`, `users`, `chat`, `media`) scaffolded, Next.js shell with a login page placeholder.
2. **M1 · Auth** — email+password signup/login, JWT + refresh cookie, `JwtAuthGuard`, `@CurrentUser()` decorator, protected `/app` route.
3. **M2 · Plaintext chat + Storage Strategy** — Socket.io gateway, create DM, send/receive, conversation list, delivery receipt. Ship `ChatStorageStrategy` with both `Database` and `InMemory` implementations + the "Temporary Chat" toggle. **No crypto yet.**
4. **M3 · E2EE layer** — key generation on signup, key bundle upload, `ConversationKey` wrap/unwrap, encrypt on send / decrypt on receive. Swap the M2 pipes to carry ciphertext.
5. **M4 · Groups** — group creation, add/remove members, rotate conversation key on membership change.
6. **M5 · Media** — Cloudinary signed upload endpoint, client-side encrypt-then-upload, decrypt-then-render.
7. **M6 · WebRTC 1:1 calls** — signaling over the existing socket, call UI (accept/reject/hangup/mute), Google STUN only.

Stretch (only if time allows): typing indicators, read receipts, presence, dark mode, mobile layout.

---

## 7. Project Layout

```
relay-backend/src/
  auth/         controllers, guards, passport strategies (Local, JWT)
  users/        user + key-bundle endpoints
  chat/         rest controllers + socket gateway + message factory
                storage/
                  chat-storage.strategy.ts       (interface)
                  database-chat.strategy.ts      (Prisma-backed)
                  in-memory-chat.strategy.ts     (Map-backed)
                  chat-storage.provider.ts       (picks one at runtime)
  media/        cloudinary signed-upload endpoint
  common/       prisma.service, decorators (@CurrentUser)
  app.module.ts

relay-app/app/
  (auth)/login, (auth)/signup
  (app)/chat/[id]           conversation view
  (app)/layout.tsx          sidebar + conversation list
  lib/crypto/               libsodium wrappers, KeyStore singleton
  lib/socket/               socket client + event bus
  lib/api/                  fetch wrappers
  components/               ChatInput, MessageBubble, CallOverlay
```

---

## 8. Ground Rules (to keep things easy)

- **No microservices.** One Nest app, one Next app, one DB.
- **No Redis in v1.** Presence + pub/sub stay in-process; we'll note in the README that horizontal scaling would need Redis.
- **No monorepo tooling.** Two sibling folders, two `package.json`s. Share types by copy-paste or a tiny shared `.d.ts` if it gets painful.
- **No custom TURN server.** If calls fail behind symmetric NAT in dev, we document it.
- **No multi-device.** One browser per user. Logging in elsewhere regenerates keys (loses history) — and we tell the user.

---

## 9. What to write in the final README

Three short sections that win points on a study project:
1. **Threat model** — what we protect against (server reading messages) and what we don't (metadata, forward secrecy, device compromise).
2. **Design patterns used** — the table in §5 with file links.
3. **How to run locally** — copy-pasteable `.env.example`, `npm install && npm run dev` on each side.

---

## 10. Ready to start?

Next step: M0 — set up Prisma + Neon and scaffold the four Nest modules. Say the word and I'll do it.
