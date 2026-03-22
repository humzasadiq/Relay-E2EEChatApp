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
| Auth | JWT + Google OAuth | Passport strategies, easy to demo. |
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

## 5. Design Patterns — minimal, honest use

Only six patterns. Each one solves a real problem in this app.

| Pattern | Where | What it does |
|---|---|---|
| **Singleton** | `PrismaService`, client-side `KeyStore` | Prisma client must be one instance (connection pool). Client key cache must be shared across React components. NestJS gives us singletons by default — we just call it out. |
| **Strategy** | `AuthStrategy` (Local vs Google), `StorageStrategy` (Cloudinary vs local disk in dev) | Same interface, swappable implementations. Passport is literally built on this. |
| **Factory** | `MessageFactory.create(type, payload)` → `TextMessage` \| `MediaMessage` \| `SystemMessage` | One place that knows how to build + validate each message variant. |
| **Builder** | `MessageBuilder` on client: `.text(...).attach(...).replyTo(...).encryptFor(members).build()` | Messages have many optional fields; builder beats a constructor with 6 optionals. |
| **Observer** | RxJS `Subject` on server for chat events; client event bus for "new message" → conversation list + unread badge + toast | Multiple subscribers react to one event. Socket.io is observer-ish already; we make it explicit. |
| **Decorator** | NestJS `@Injectable`, `@UseGuards(JwtAuthGuard)`, our own `@CurrentUser()` | Free — we just need to use and explain it. |

We **skip Prototype** — no honest use case here. Better to use 6 patterns well than force a 7th.

---

## 6. Build Order (suggested 7 milestones)

Each milestone ends with something demoable.

1. **M0 · Foundations** — Prisma + Neon connected, NestJS modules (`auth`, `users`, `chat`, `media`) scaffolded, Next.js shell with a login page placeholder.
2. **M1 · Auth** — email+password signup/login, JWT + refresh cookie, `JwtAuthGuard`, Google OAuth, protected `/app` route.
3. **M2 · Plaintext chat** — Socket.io gateway, create DM, send/receive messages, conversation list, delivery receipt. **No crypto yet.**
4. **M3 · E2EE layer** — key generation on signup, key bundle upload, `ConversationKey` wrap/unwrap, encrypt on send / decrypt on receive. Swap the M2 pipes to carry ciphertext.
5. **M4 · Groups** — group creation, add/remove members, rotate conversation key on membership change.
6. **M5 · Media** — Cloudinary signed upload endpoint, client-side encrypt-then-upload, decrypt-then-render.
7. **M6 · WebRTC 1:1 calls** — signaling over the existing socket, call UI (accept/reject/hangup/mute), Google STUN only.

Stretch (only if time allows): typing indicators, read receipts, presence, dark mode, mobile layout.

---

## 7. Project Layout

```
relay-backend/src/
  auth/         controllers, guards, strategies (Local, Google, JWT)
  users/        user + key-bundle endpoints
  chat/         rest controllers + socket gateway + message factory
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
