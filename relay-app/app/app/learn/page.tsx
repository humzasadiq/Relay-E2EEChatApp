"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

/* ── visual-only fake data (no real crypto) ────────────────────────── */
function fakeHex(len: number, seed: string) {
  const h = "0123456789abcdef";
  return Array.from({ length: len }, (_, i) =>
    h[Math.abs((seed.charCodeAt(i % Math.max(seed.length, 1)) * 31 + i * 7) % 16)],
  ).join("");
}

function fakeCipher(msg: string) {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  return Array.from({ length: Math.max(msg.length * 2 + 8, 32) }, (_, i) =>
    c[Math.abs((msg.charCodeAt(i % Math.max(msg.length, 1)) * 31 + i * 17 + 5) % c.length)],
  ).join("");
}

/* ── data ──────────────────────────────────────────────────────────── */
const PRIMITIVES = [
  {
    name: "argon2id",
    tagline: "The Password Strengthener",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.10)",
    icon: "🛡️",
    desc: `Your human-readable password is run through argon2id — a deliberately slow algorithm that performs hundreds of thousands of iterations and uses a large chunk of RAM. This makes brute-force guessing take centuries even on modern hardware. The output is your KEK (Key Encryption Key), which unlocks your private key bundle.`,
  },
  {
    name: "Ed25519",
    tagline: "Your ID Card",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.10)",
    icon: "🪪",
    desc: `An asymmetric keypair based on the Edwards curve. Your public half is like a stamp visible to everyone — "yes, this came from me." Your private half is the pen only you hold. Currently stored for future message-signing; it will let others cryptographically verify a message wasn't tampered with in transit.`,
  },
  {
    name: "X25519",
    tagline: "The Handshake Key",
    color: "#34d399",
    bg: "rgba(52,211,153,0.10)",
    icon: "🤝",
    desc: `Your "mailbox" keypair. Anyone can drop a sealed envelope into your public slot (your exchangePubKey). Only your private X25519 key can open what lands in there. When someone starts a chat with you, they generate a random conversation key and seal it inside this mailbox — only you can retrieve it.`,
  },
  {
    name: "crypto_box_seal",
    tagline: "The Anonymous Drop Box",
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.10)",
    icon: "📬",
    desc: `Encrypts a secret using the recipient's X25519 public key with no return address on the envelope. Even if the server intercepts it, they can't read it — and they can't tell who sent it. Used to wrap the conversation key for each chat member before the server stores it.`,
  },
  {
    name: "XSalsa20-Poly1305",
    tagline: "The Message Vault (secretbox)",
    color: "#f87171",
    bg: "rgba(248,113,113,0.10)",
    icon: "🔒",
    desc: `Fast symmetric encryption — the same key both locks and unlocks. Used for two jobs: sealing your private key bundle (locked with the KEK) and encrypting every message (locked with the convKey). Poly1305 is the authentication tag — if anyone tampers with the ciphertext even by one bit, decryption throws an error.`,
  },
  {
    name: "Nonce",
    tagline: "Number Used Once",
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.10)",
    icon: "🎲",
    desc: `A random value generated fresh for every single encryption. It ensures that encrypting "Hello" twice produces completely different ciphertext each time. The nonce is stored alongside the message — it's not secret, but it must never be reused with the same key or the encryption breaks.`,
  },
];

const SAFES = [
  {
    label: "Outer Safe",
    title: "Your Identity",
    sub: "Locked by your password",
    color: "#2e6ee5",
    bg: "rgba(46,110,229,0.08)",
    icon: "🪪",
    contents: "Ed25519 signing key + X25519 exchange key (both public and private halves)",
    lock: "argon2id(password, salt) → KEK → secretbox_open(wrappedPrivateKeys, KEK)",
  },
  {
    label: "Middle Safe",
    title: "Conversation Key",
    sub: "Sealed inside an anonymous envelope",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.08)",
    icon: "💬",
    contents: "32 random bytes — the symmetric key for this specific chat",
    lock: "crypto_box_seal_open(wrappedConvKey, exchangePubKey, exchangePrivKey)",
  },
  {
    label: "Inner Safe",
    title: "Your Message",
    sub: "Locked by the conversation key",
    color: "#34d399",
    bg: "rgba(52,211,153,0.08)",
    icon: "✉️",
    contents: '"Hello, Alice!" stored only as gibberish in the database',
    lock: "secretbox_open(ciphertext, nonce, convKey) → plaintext",
  },
];

/* ── main page ─────────────────────────────────────────────────────── */
export default function LearnPage() {
  const [message, setMessage] = useState("Hello, Alice!");
  const [step, setStep] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [openSafe, setOpenSafe] = useState<number | null>(null);
  const [expandedAlgo, setExpandedAlgo] = useState<number | null>(null);

  const s = message || "x";
  const kek = fakeHex(32, s + "kek");
  const exchangePrivKey = fakeHex(32, s + "priv");
  const convKey = fakeHex(32, s + "conv");
  const nonce = fakeHex(24, s + "nonce");
  const cipher = fakeCipher(message || "x");
  const salt = fakeHex(32, s + "salt");

  type DemoOutput = { label: string; value: string; highlight?: boolean };
  type DemoStep = {
    icon: string;
    title: string;
    primitive: string;
    color: string;
    description: string;
    output: DemoOutput[];
  };

  const STEPS: DemoStep[] = [
    {
      icon: "🔑",
      title: "argon2id stretches your password into a KEK",
      primitive: "argon2id",
      color: "#f59e0b",
      description:
        "Your password runs through argon2id with a random salt and 65,536 iterations. This is deliberately slow — a brute-force attacker would need decades. The output is your Key Encryption Key (KEK), never sent to the server.",
      output: [
        { label: "password", value: "••••••••" },
        { label: "salt (random, stored on server)", value: salt },
        { label: "→ KEK (only exists in your browser)", value: kek, highlight: true },
      ],
    },
    {
      icon: "📦",
      title: "KEK unlocks your wrapped private keys",
      primitive: "XSalsa20-Poly1305",
      color: "#f87171",
      description:
        "The server hands you back the encrypted blob it stored at signup. Your browser uses the KEK to run secretbox_open — decrypting your private key bundle. The server stored the blob but never had the KEK, so it can't do this.",
      output: [
        { label: "KEK", value: kek },
        { label: "wrappedPrivateKeys (from server, opaque)", value: "[" + fakeHex(40, s + "blob") + "…]" },
        {
          label: "→ exchangePrivKey (now in browser memory only)",
          value: exchangePrivKey,
          highlight: true,
        },
      ],
    },
    {
      icon: "💌",
      title: "Exchange key opens your sealed envelope",
      primitive: "crypto_box_seal_open",
      color: "#60a5fa",
      description:
        "When this chat was created, the initiator wrapped the conversation key inside a sealed envelope for you (addressed to your exchangePubKey). Now your private exchange key opens it. The server stored both envelopes but can open neither.",
      output: [
        { label: "exchangePrivKey", value: exchangePrivKey },
        {
          label: "wrappedConvKey (your sealed envelope, from server)",
          value: "[" + fakeHex(44, s + "env") + "…]",
        },
        { label: "→ convKey (only in browser memory)", value: convKey, highlight: true },
      ],
    },
    {
      icon: "🔒",
      title: "convKey encrypts your message",
      primitive: "XSalsa20-Poly1305",
      color: "#34d399",
      description:
        "A fresh random nonce is generated. The conversation key and nonce encrypt your plaintext into ciphertext. If you send the exact same message again, the ciphertext looks completely different — because the nonce is new every time.",
      output: [
        { label: "plaintext", value: message || "Hello, Alice!" },
        { label: "nonce (random, generated now)", value: nonce },
        { label: "convKey", value: convKey },
        { label: "→ ciphertext (sent to server)", value: cipher, highlight: true },
      ],
    },
    {
      icon: "📡",
      title: "Only gibberish reaches the server",
      primitive: "server's view",
      color: "#94a3b8",
      description:
        "The server receives and stores the ciphertext and nonce. It has no KEK, no private keys, no convKey. If someone steals the entire database they get only locked boxes. To open them, they'd need your original password and Argon2id makes guessing that practically impossible.",
      output: [
        { label: "server stores: ciphertext", value: cipher },
        { label: "server stores: nonce", value: nonce },
        { label: "server reads: plaintext", value: "🚫  not possible" },
      ],
    },
  ];

  // argon2id fake progress
  useEffect(() => {
    if (step !== 0) return;
    setProgress(0);
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(id);
          return 100;
        }
        return p + 3;
      });
    }, 40);
    return () => clearInterval(id);
  }, [step]);

  return (
    <main
      className="flex-1 overflow-y-auto"
      style={{ background: "var(--background)" }}
    >
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-20">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="text-center space-y-5">
          <motion.div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-1"
            style={{
              background: "linear-gradient(135deg, var(--primary), var(--accent))",
            }}
            animate={{
              boxShadow: [
                "0 0 0px var(--primary)",
                "0 0 40px var(--primary)",
                "0 0 0px var(--primary)",
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="text-4xl">🔐</span>
          </motion.div>

          <h1 className="text-3xl font-bold" style={{ color: "var(--text)" }}>
            How Relay Encrypts Your Messages
          </h1>

          <p
            className="text-sm leading-relaxed max-w-lg mx-auto"
            style={{ color: "var(--muted)" }}
          >
            Relay uses{" "}
            <strong style={{ color: "var(--text)" }}>libsodium</strong> — an
            industry-standard cryptography library — to keep every message
            private. The server is a{" "}
            <strong style={{ color: "var(--text)" }}>blind delivery driver</strong>
            : it carries locked boxes between users but has absolutely no way to
            look inside any of them.
          </p>

          <div
            className="inline-flex items-center gap-2 text-xs rounded-full px-4 py-2"
            style={{
              background: "color-mix(in srgb, var(--primary) 10%, transparent)",
              color: "var(--primary)",
            }}
          >
            <span>🔒</span>
            End-to-End Encrypted · libsodium · argon2id · X25519 · XSalsa20-Poly1305
          </div>
        </section>

        {/* ── Three Nested Safes ───────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
              The Three Nested Safes
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              To read a single message you must open the outer safe, then the
              middle, then the inner. The server can&apos;t start — it never has
              your password. Click each safe to inspect what&apos;s inside.
            </p>
          </div>

          <div className="space-y-0">
            {SAFES.map((safe, i) => (
              <motion.div
                key={safe.label}
                className="rounded-2xl border-2 p-5 cursor-pointer"
                style={{
                  marginInline: i === 0 ? 0 : `${i * 18}px`,
                  marginTop: i > 0 ? -10 : 0,
                  background: openSafe === i ? safe.bg : "var(--surface)",
                  borderColor: openSafe === i ? safe.color : "var(--border)",
                  position: "relative",
                  zIndex: 10 - i,
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onClick={() => setOpenSafe(openSafe === i ? null : i)}
                layout
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                    style={{ background: safe.bg }}
                  >
                    {safe.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: safe.color }}
                      >
                        {safe.label}
                      </span>
                      <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                        — {safe.sub}
                      </span>
                    </div>
                    <div
                      className="text-sm font-semibold"
                      style={{ color: "var(--text)" }}
                    >
                      {safe.title}
                    </div>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: "var(--muted)" }}>
                    {openSafe === i ? "▲" : "▼"}
                  </span>
                </div>

                <AnimatePresence>
                  {openSafe === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div
                        className="mt-4 pt-4 space-y-2"
                        style={{
                          borderTop: `1px solid color-mix(in srgb, ${safe.color} 30%, transparent)`,
                        }}
                      >
                        <div
                          className="text-xs font-mono rounded-lg p-3"
                          style={{ background: "var(--surface-2)" }}
                        >
                          <span style={{ color: "var(--muted)" }}>contains → </span>
                          <span style={{ color: "var(--text)" }}>{safe.contents}</span>
                        </div>
                        <div
                          className="text-xs font-mono rounded-lg p-3"
                          style={{ background: "var(--surface-2)" }}
                        >
                          <span style={{ color: "var(--muted)" }}>opened by → </span>
                          <span style={{ color: safe.color }}>{safe.lock}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>

          <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
            Because these safes nest, a server breach exposes nothing. An attacker
            would need your original password and years of compute to crack argon2id.
          </p>
        </section>

        {/* ── Algorithm Glossary ───────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
              The Cryptographic Building Blocks
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              All provided by{" "}
              <strong style={{ color: "var(--text)" }}>libsodium</strong> — a
              rigorously audited, cross-platform cryptography library. Click any
              card to expand.
            </p>
          </div>

          <div className="space-y-2">
            {PRIMITIVES.map((p, i) => (
              <motion.div
                key={p.name}
                className="rounded-xl border p-4 cursor-pointer"
                style={{
                  background: expandedAlgo === i ? p.bg : "var(--surface)",
                  borderColor:
                    expandedAlgo === i ? p.color : "var(--border)",
                  borderWidth: 1.5,
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onClick={() => setExpandedAlgo(expandedAlgo === i ? null : i)}
                layout
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl shrink-0">{p.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <code
                        className="text-sm font-bold font-mono"
                        style={{ color: p.color }}
                      >
                        {p.name}
                      </code>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        — {p.tagline}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: "var(--muted)" }}>
                    {expandedAlgo === i ? "▲" : "▼"}
                  </span>
                </div>

                <AnimatePresence>
                  {expandedAlgo === i && (
                    <motion.p
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden text-sm mt-3 leading-relaxed"
                      style={{ color: "var(--muted)" }}
                    >
                      {p.desc}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Live Demo ─────────────────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
              Live Demo: Follow Your Message Through The Vault
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Type any message and step through each cryptographic layer. The hex
              strings are illustrative — same structure as real libsodium output,
              seeded by your text.
            </p>
          </div>

          {/* Input */}
          {step === -1 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message…"
                className="flex-1 rounded-xl py-3 px-4 text-sm outline-none"
                style={{
                  background: "var(--surface)",
                  border: "1.5px solid var(--border-strong)",
                  color: "var(--text)",
                }}
              />
              <button
                onClick={() => setStep(0)}
                disabled={!message.trim()}
                className="rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-40 whitespace-nowrap"
                style={{ background: "var(--primary)", color: "var(--on-primary)" }}
              >
                Encrypt & Send →
              </button>
            </motion.div>
          )}

          {/* Steps UI */}
          {step >= 0 && (
            <div className="space-y-3">
              {/* Step track */}
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className="flex-1 h-1.5 rounded-full transition-all"
                    style={{
                      background:
                        i === step
                          ? "var(--primary)"
                          : i < step
                            ? "color-mix(in srgb, var(--primary) 45%, transparent)"
                            : "var(--border-strong)",
                    }}
                  />
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-2xl p-5 space-y-4"
                  style={{
                    background: "var(--surface)",
                    border: `1.5px solid ${STEPS[step].color}44`,
                  }}
                >
                  {/* Step header */}
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0 mt-0.5">{STEPS[step].icon}</span>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[10px] font-bold uppercase tracking-widest mb-0.5"
                        style={{ color: "var(--muted)" }}
                      >
                        Step {step + 1} of {STEPS.length}
                      </div>
                      <div
                        className="text-sm font-semibold leading-snug"
                        style={{ color: "var(--text)" }}
                      >
                        {STEPS[step].title}
                      </div>
                    </div>
                    <code
                      className="shrink-0 text-[10px] px-2 py-1 rounded-full font-mono"
                      style={{
                        background: `${STEPS[step].color}18`,
                        color: STEPS[step].color,
                      }}
                    >
                      {STEPS[step].primitive}
                    </code>
                  </div>

                  {/* argon2id progress bar */}
                  {step === 0 && (
                    <div className="space-y-1.5">
                      <div
                        className="h-2 rounded-full overflow-hidden"
                        style={{ background: "var(--surface-2)" }}
                      >
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            width: `${progress}%`,
                            background: "#f59e0b",
                            transition: "width 0.04s linear",
                          }}
                        />
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                        {progress < 100
                          ? `Running 65,536 argon2id iterations… ${progress}%`
                          : "Complete ✓  KEK derived"}
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--muted)" }}
                  >
                    {STEPS[step].description}
                  </p>

                  {/* Output rows */}
                  <div className="space-y-2 font-mono text-xs">
                    {STEPS[step].output.map(({ label, value, highlight }) => (
                      <div
                        key={label}
                        className="flex flex-col gap-1 rounded-lg p-3"
                        style={{
                          background: highlight
                            ? `color-mix(in srgb, ${STEPS[step].color} 8%, var(--surface-2))`
                            : "var(--surface-2)",
                          border: highlight
                            ? `1px solid ${STEPS[step].color}44`
                            : "1px solid transparent",
                        }}
                      >
                        <span
                          className="text-[9px] uppercase tracking-widest font-sans font-semibold"
                          style={{ color: "var(--muted)" }}
                        >
                          {label}
                        </span>
                        <span
                          className="break-all leading-relaxed"
                          style={{
                            color:
                              value === "🚫  not possible"
                                ? "var(--danger)"
                                : highlight
                                  ? STEPS[step].color
                                  : "var(--text)",
                          }}
                        >
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Navigation */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setStep(-1); setProgress(0); }}
                  className="px-4 py-2 rounded-xl text-xs"
                  style={{ background: "var(--surface-2)", color: "var(--muted)" }}
                >
                  ↺ Reset
                </button>
                {step > 0 && (
                  <button
                    onClick={() => setStep((s) => s - 1)}
                    className="px-4 py-2 rounded-xl text-xs"
                    style={{
                      background: "var(--surface)",
                      color: "var(--text)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    ← Back
                  </button>
                )}
                {step < STEPS.length - 1 ? (
                  <button
                    onClick={() => setStep((s) => s + 1)}
                    className="ml-auto px-5 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: "var(--primary)", color: "var(--on-primary)" }}
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    onClick={() => { setStep(-1); setProgress(0); }}
                    className="ml-auto px-5 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: "var(--surface-2)", color: "var(--text)" }}
                  >
                    Try again ↺
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Server storage comparison ─────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
              What the Server Actually Stores
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Every sensitive value the server holds is an opaque blob — cryptographically
              meaningless without keys it never receives.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* You see */}
            <div
              className="rounded-2xl p-5 space-y-3"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "var(--primary)" }}
              >
                👁️ You see in your browser
              </div>
              {[
                ["Your password", "correct horse battery"],
                ["Exchange priv key", exchangePrivKey.slice(0, 24) + "…"],
                ["Conversation key", convKey.slice(0, 24) + "…"],
                ["Your message", message || "Hello, Alice!"],
              ].map(([label, val]) => (
                <div key={label} className="text-xs space-y-1">
                  <div style={{ color: "var(--muted)" }}>{label}</div>
                  <div
                    className="font-mono rounded px-2 py-1.5 truncate"
                    style={{ background: "var(--surface-2)", color: "var(--text)" }}
                  >
                    {val}
                  </div>
                </div>
              ))}
            </div>

            {/* Server stores */}
            <div
              className="rounded-2xl p-5 space-y-3"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "var(--danger)" }}
              >
                🗄️ Server stores
              </div>
              {[
                ["Password hash", "argon2id$v=19$m=65536…"],
                ["Wrapped priv keys", "[opaque secretbox blob]"],
                ["Wrapped conv key", "[sealed envelope blob]"],
                ["Message ciphertext", cipher.slice(0, 20) + "…"],
              ].map(([label, val]) => (
                <div key={label} className="text-xs space-y-1">
                  <div style={{ color: "var(--muted)" }}>{label}</div>
                  <div
                    className="font-mono rounded px-2 py-1.5 truncate"
                    style={{ background: "var(--surface-2)", color: "var(--muted)" }}
                  >
                    {val}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <motion.div
            className="rounded-2xl p-5 text-center space-y-2"
            style={{
              background:
                "color-mix(in srgb, var(--primary) 6%, var(--surface))",
              border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)",
            }}
            whileHover={{ scale: 1.01 }}
          >
            <div className="text-2xl">🏦</div>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
              A full database breach reveals nothing readable.
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              To read even a single message, an attacker would need to guess your password
              and run argon2id (65,536 iterations per guess) — making brute-force
              computationally infeasible for a strong password.
            </p>
          </motion.div>
        </section>

        <div className="h-12" />
      </div>
    </main>
  );
}
