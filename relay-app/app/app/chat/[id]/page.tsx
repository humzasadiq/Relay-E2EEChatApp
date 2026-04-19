"use client";

import {
  EmojiPicker,
  type EmojiPickerListCategoryHeaderProps,
  type EmojiPickerListEmojiProps,
  type EmojiPickerListRowProps,
} from "frimousse";
import { useParams } from "next/navigation";
import {
  Fragment,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Avatar } from "../../../_components/avatar";
import { TextScramble } from "../../../_components/ui/text-scramble";
import { useAuth } from "../../../lib/auth-store";
import { useCallStore } from "../../../lib/call-store";
import { useChat } from "../../../lib/chat-store";
import { api, ApiError, Conversation, PublicUser } from "../../../lib/api";

/* ── helpers ─────────────────────────────────────────────────────── */

const EMOJI_ONLY_RE = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\uFE0F|\u200D|\s)+$/u;
function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && EMOJI_ONLY_RE.test(t);
}
function emojiCount(text: string): number {
  try {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text.trim())]
      .filter((s) => EMOJI_ONLY_RE.test(s.segment)).length;
  } catch {
    return text.trim().length;
  }
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayLabel(d: Date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

function convLabel(conv: Conversation, myId: string) {
  if (conv.name) return conv.name;
  if (conv.type === "DIRECT") {
    const otherId = conv.memberIds.find((id) => id !== myId);
    if (otherId && conv.memberNames[otherId]) return conv.memberNames[otherId];
    return "Direct message";
  }
  return "Group";
}

function convAvatarSeed(conv: Conversation, myId: string): string {
  if (conv.type === "DIRECT") {
    const otherId = conv.memberIds.find((id) => id !== myId);
    if (otherId && conv.memberEmails[otherId]) return conv.memberEmails[otherId];
  }
  return conv.name ?? conv.id;
}

/* ── sender colour for group chats (deterministic per-userId) ──────── */
const GROUP_COLORS = [
  "#2e6ee5",
  "#e5852e",
  "#2ea858",
  "#c02ee5",
  "#e52e5f",
  "#2ec0e5",
  "#e5c02e",
];
function senderColor(userId: string) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return GROUP_COLORS[Math.abs(h) % GROUP_COLORS.length];
}

/* ── double-check icon ───────────────────────────────────────────── */
function DoubleCheck({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden>
      <path
        d="M1 5.2l2.8 2.8L8.6 1.6"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.2 5.2L9 8l5.8-6.4"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Emoji picker — custom list components for proper sizing ────── */
const EmojiPickerCategoryHeader = ({
  category,
  ...props
}: EmojiPickerListCategoryHeaderProps) => (
  <div
    {...props}
    className="sticky top-0 z-10 px-2.5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider bg-surface"
    style={{ color: "var(--muted)" }}
  >
    {category.label}
  </div>
);

const EmojiPickerRow = ({ ...props }: EmojiPickerListRowProps) => (
  <div {...props} className="flex px-1.5" />
);

const EmojiPickerEmoji = ({
  emoji,
  ...props
}: EmojiPickerListEmojiProps) => (
  <button
    {...props}
    type="button"
    aria-label={emoji.label}
    className="flex size-8 shrink-0 items-center justify-center rounded-md text-xl transition-colors"
    style={{
      background: emoji.isActive ? "var(--surface-hover)" : "transparent",
    }}
  >
    {emoji.emoji}
  </button>
);

/* ── Emoji picker popover ────────────────────────────────────────── */
function EmojiPickerPopover({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 right-0 z-40 rounded-2xl overflow-hidden shadow-2xl"
      style={{
        width: 320,
        height: 400,
        border: "1px solid var(--border-strong)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <EmojiPicker.Root
        onEmojiSelect={(e) => {
          onPick(e.emoji);
          onClose();
        }}
        columns={9}
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      >
        {/* Search bar */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--muted)", flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <EmojiPicker.Search
            placeholder="Search emoji…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text)" }}
          />
          <EmojiPicker.SkinToneSelector />
        </div>

        {/* Scrollable emoji grid */}
        <EmojiPicker.Viewport
          style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 8 }}
        >
          <EmojiPicker.Loading>
            <div
              className="flex items-center justify-center py-8 text-sm"
              style={{ color: "var(--muted)" }}
            >
              Loading…
            </div>
          </EmojiPicker.Loading>
          <EmojiPicker.Empty>
            <div
              className="flex items-center justify-center py-8 text-sm"
              style={{ color: "var(--muted)" }}
            >
              No results.
            </div>
          </EmojiPicker.Empty>
          <EmojiPicker.List
            components={{
              CategoryHeader: EmojiPickerCategoryHeader,
              Row: EmojiPickerRow,
              Emoji: EmojiPickerEmoji,
            }}
          />
        </EmojiPicker.Viewport>
      </EmojiPicker.Root>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const { user, accessToken } = useAuth();
  const {
    conversations,
    messagesByConv,
    openConversation,
    sendMessage,
    markRead,
    tempSessionByConv,
    toggleTempSession,
    loadingConvId,
  } = useChat();

  const conv = useMemo(
    () => conversations.find((c) => c.id === id) ?? null,
    [conversations, id],
  );
  const messages = messagesByConv[id] ?? [];
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);

  const myId = user?.id ?? "";
  const title = conv ? convLabel(conv, myId) : "…";
  const tempSince = conv ? (tempSessionByConv[conv.id] ?? null) : null;
  const isTempActive = tempSince !== null;

  const { initiateCall, active: activeCall } = useCallStore();
  const otherId =
    conv?.type === "DIRECT"
      ? conv.memberIds.find((mid) => mid !== myId) ?? null
      : null;
  const isOwner = conv?.type === "GROUP" && conv.ownerId === myId;

  const startCall = (isVideo: boolean) => {
    if (!accessToken || !id || !otherId) return;
    initiateCall(accessToken, { conversationId: id, recipientId: otherId, isVideo });
  };

  // ── Group management state ──────────────────────────────────────────
  const { addGroupMember, removeGroupMember } = useChat();
  const [showMembers, setShowMembers] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [amEmail, setAmEmail] = useState("");
  const [amCandidate, setAmCandidate] = useState<PublicUser | null>(null);
  const [amSearching, setAmSearching] = useState(false);
  const [amError, setAmError] = useState<string | null>(null);
  const [amWorking, setAmWorking] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const searchMember = async () => {
    if (!accessToken || !amEmail) return;
    setAmSearching(true);
    setAmError(null);
    setAmCandidate(null);
    try {
      const [found] = await api.searchUsers(accessToken, amEmail);
      if (!found) { setAmError("No user with that email."); return; }
      if (conv?.memberIds.includes(found.id)) { setAmError("Already a member."); return; }
      setAmCandidate(found);
    } catch (e) {
      setAmError(e instanceof ApiError ? e.message : "Search failed");
    } finally {
      setAmSearching(false);
    }
  };

  const doAddMember = async () => {
    if (!accessToken || !id || !amCandidate) return;
    setAmWorking(true);
    setAmError(null);
    try {
      await addGroupMember(accessToken, id, amCandidate);
      setAmEmail("");
      setAmCandidate(null);
      setShowAddMember(false);
    } catch (e) {
      setAmError(e instanceof ApiError ? e.message : "Could not add member");
    } finally {
      setAmWorking(false);
    }
  };

  const doRemoveMember = async (userId: string) => {
    if (!accessToken || !id) return;
    setRemovingId(userId);
    try {
      await removeGroupMember(accessToken, id, userId);
    } catch {
      // stay in panel; user can retry
    } finally {
      setRemovingId(null);
    }
  };
  // Baseline for "new message" detection — anything with createdAt
  // after this moment scrambles on first render.
  const pageMountRef = useRef(Date.now());

  useEffect(() => {
    if (accessToken && id) openConversation(accessToken, id);
  }, [accessToken, id, openConversation]);

  useEffect(() => {
    if (id) markRead(id);
  }, [id, messages.length, markRead]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!accessToken || !id || !text.trim()) return;
    await sendMessage(accessToken, id, text.trim());
    setText("");
  };

  const appendEmoji = useCallback(
    (emoji: string) => {
      setText((t) => t + emoji);
      inputRef.current?.focus();
    },
    [],
  );

  return (
    <main className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-3 border-b bg-surface shrink-0" style={{ borderColor: "var(--border)" }}>
        <Avatar name={conv ? convAvatarSeed(conv, myId) : title} size={40} variant={conv?.type === "GROUP" ? "pixel" : "beam"} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{title}</span>
            {conv?.temporary && (
              <span className="text-[10px] uppercase tracking-widest rounded-full px-2 py-0.5 cursor-pointer" style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
                Temporary
              </span>
            )}
          </div>
          <span className="text-xs text-muted">End-to-end encrypted</span>
        </div>
        {/* Header actions */}
        <div className="flex items-center gap-1">
          {/* Temporary chat toggle */}
          <button
            onClick={() => conv && accessToken && toggleTempSession(accessToken, conv.id)}
            title={isTempActive ? "End temporary chat" : "Start temporary chat"}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer"
            style={{
              background: isTempActive ? "var(--primary)" : "transparent",
              color: isTempActive ? "var(--on-primary)" : "var(--muted)",
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13.5 3.1c-.5 0-1-.1-1.5-.1s-1 .1-1.5.1" />
              <path d="M19.3 6.8a10.45 10.45 0 0 0-2.1-2.1" />
              <path d="M20.9 13.5c.1-.5.1-1 .1-1.5s-.1-1-.1-1.5" />
              <path d="M17.2 19.3a10.45 10.45 0 0 0 2.1-2.1" />
              <path d="M10.5 20.9c.5.1 1 .1 1.5.1s1-.1 1.5-.1" />
              <path d="M3.5 17.5 2 22l4.5-1.5" />
              <path d="M3.1 10.5c0 .5-.1 1-.1 1.5s.1 1 .1 1.5" />
              <path d="M6.8 4.7a10.45 10.45 0 0 0-2.1 2.1" />
            </svg>
          </button>
          {/* DIRECT: video + voice call */}
          {conv?.type === "DIRECT" && otherId && (
            <>
              <button onClick={() => startCall(true)} disabled={!!activeCall} title="Video call" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors text-muted disabled:opacity-40">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
              </button>
              <button onClick={() => startCall(false)} disabled={!!activeCall} title="Voice call" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors text-muted disabled:opacity-40">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.75h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
              </button>
            </>
          )}

          {/* GROUP: members panel + add member (owner only) */}
          {conv?.type === "GROUP" && (
            <>
              <button onClick={() => setShowMembers(true)} title="Members" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors text-muted">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </button>
              {isOwner && (
                <button onClick={() => setShowAddMember(true)} title="Add member" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors text-muted">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Members panel modal */}
      {showMembers && conv?.type === "GROUP" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowMembers(false)}>
          <div className="w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-base font-semibold">Members · {conv.memberIds.length}</h2>
              <button onClick={() => setShowMembers(false)} className="rounded-full w-7 h-7 flex items-center justify-center hover:bg-surface-hover text-muted">×</button>
            </header>
            <ul className="flex flex-col gap-0 py-2 max-h-80 overflow-y-auto">
              {conv.memberIds.map((uid) => {
                const name = conv.memberNames[uid] ?? uid;
                const email = conv.memberEmails[uid] ?? uid;
                const isMe = uid === myId;
                const isConvOwner = uid === conv.ownerId;
                return (
                  <li key={uid} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover">
                    <Avatar name={email} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{name}{isMe ? " (you)" : ""}{isConvOwner ? " · owner" : ""}</div>
                      <div className="text-xs truncate" style={{ color: "var(--muted)" }}>{email}</div>
                    </div>
                    {isOwner && !isMe && (
                      <button
                        onClick={() => doRemoveMember(uid)}
                        disabled={removingId === uid}
                        className="shrink-0 text-xs px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                        style={{ color: "#ef4444", background: "color-mix(in srgb, #ef4444 10%, transparent)" }}
                      >
                        {removingId === uid ? "…" : "Remove"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {isOwner && (
              <div className="px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
                <button
                  onClick={() => { setShowMembers(false); setShowAddMember(true); }}
                  className="w-full rounded-lg py-2 text-sm font-medium transition-colors"
                  style={{ background: "var(--surface-2)", color: "var(--text)" }}
                >+ Add member</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add member modal */}
      {showAddMember && conv?.type === "GROUP" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setShowAddMember(false); setAmEmail(""); setAmCandidate(null); setAmError(null); }}>
          <div className="w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-base font-semibold">Add member</h2>
              <button onClick={() => { setShowAddMember(false); setAmEmail(""); setAmCandidate(null); setAmError(null); }} className="rounded-full w-7 h-7 flex items-center justify-center hover:bg-surface-hover text-muted">×</button>
            </header>
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={amEmail}
                  onChange={(e) => setAmEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void searchMember(); } }}
                  autoFocus
                  className="flex-1 rounded-lg border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                  style={{ borderColor: "var(--border)" }}
                />
                <button onClick={searchMember} disabled={amSearching || !amEmail} className="rounded-lg bg-primary text-on-primary px-4 text-sm font-medium disabled:opacity-50">
                  {amSearching ? "…" : "Find"}
                </button>
              </div>
              {amCandidate && (
                <div className="rounded-xl border p-3 flex items-center gap-3" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                  <Avatar name={amCandidate.email} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{amCandidate.displayName}</div>
                    <div className="text-xs truncate" style={{ color: "var(--muted)" }}>{amCandidate.email}</div>
                  </div>
                </div>
              )}
              {amError && <p className="text-xs" style={{ color: "#ef4444" }}>{amError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <button onClick={() => { setShowAddMember(false); setAmEmail(""); setAmCandidate(null); setAmError(null); }} className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-surface-hover">Cancel</button>
              <button onClick={doAddMember} disabled={!amCandidate || amWorking} className="rounded-lg bg-primary text-on-primary px-4 py-2 text-sm font-medium disabled:opacity-50">
                {amWorking ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Temporary-chat banner */}
      {conv?.temporary && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs shrink-0" style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)", color: "var(--accent)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          Messages are stored in memory only and disappear when the server restarts
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollerRef}
        className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-0"
      >
        {loadingConvId === id ? (
          <div className="flex items-center justify-center my-auto">
            <div
              className="w-7 h-7 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--border-strong)", borderTopColor: "var(--primary)" }}
            />
          </div>
        ) : null}
        {loadingConvId !== id && messages.length === 0 && (
          <p className="text-sm text-muted text-center my-auto">
            {title} has added you <br />
            No messages yet. Say hi.
          </p>
        )}
        {loadingConvId !== id && messages.map((m, i) => {
          const mine = m.senderId === myId;
          const isFirstTempMsg = Boolean(
            isTempActive &&
              tempSince &&
              new Date(m.createdAt) >= new Date(tempSince) &&
              (i === 0 || new Date(messages[i - 1].createdAt) < new Date(tempSince)),
          );
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const created = new Date(m.createdAt);
          const showDay = !prev || !isSameDay(new Date(prev.createdAt), created);
          const groupedWithPrev =
            !showDay && prev?.senderId === m.senderId &&
            isSameDay(new Date(prev.createdAt), created);
          const groupedWithNext =
            next?.senderId === m.senderId &&
            isSameDay(new Date(next.createdAt), created);
          const isLastInGroup = !groupedWithNext;
          const senderName =
            !mine && conv?.type === "GROUP"
              ? conv.memberNames[m.senderId] ?? m.senderId
              : null;

          return (
            <Fragment key={m.id}>
              {isFirstTempMsg && (
                <div className="flex items-center gap-3 my-3 px-1">
                  <div className="flex-1 h-px" style={{ background: "var(--border-strong)" }} />
                  <span className="text-[11px] font-medium shrink-0" style={{ color: "var(--muted)" }}>
                    Temporary Chat Started
                  </span>
                  <div className="flex-1 h-px" style={{ background: "var(--border-strong)" }} />
                </div>
              )}
            <div className="flex flex-col">
              {showDay && (
                <div className="self-center my-4 text-[11px] uppercase tracking-widest text-muted bg-surface-2 rounded-full px-3 py-1">
                  {dayLabel(created)}
                </div>
              )}
              <div
                className={`flex ${mine ? "justify-end" : "justify-start"} ${
                  groupedWithPrev ? "mt-0.5" : "mt-2"
                }`}
              >
                {/* incoming avatar — only show on last in group */}
                {!mine && (
                  <div className="mr-2 self-end">
                    {isLastInGroup ? (
                      <Avatar name={conv?.memberEmails[m.senderId] ?? senderName ?? title} size={28} />
                    ) : (
                      <div className="w-7" />
                    )}
                  </div>
                )}

                <div className="flex flex-col max-w-[72%]">
                  {/* group sender name */}
                  {senderName && !groupedWithPrev && (
                    <span
                      className="text-[11px] font-semibold mb-0.5 ml-1"
                      style={{ color: senderColor(m.senderId) }}
                    >
                      {senderName}
                    </span>
                  )}

                  {(() => {
                    const text = m.text ?? "…";
                    const emojiOnly = isEmojiOnly(text);
                    const count = emojiOnly ? emojiCount(text) : 0;
                    const emojiFontSize = count <= 3 ? "2.5rem" : "1.75rem";

                    if (emojiOnly) {
                      return (
                        <div className="wrap-break-word">
                          <TextScramble
                            as="div"
                            className="leading-none select-none"
                            style={{ fontSize: emojiFontSize }}
                            duration={0.6}
                            speed={0.025}
                            trigger={new Date(m.createdAt).getTime() > pageMountRef.current}
                          >
                            {text}
                          </TextScramble>
                          {isLastInGroup && (
                            <div className={`mt-1 flex items-center gap-1 ${mine ? "justify-end" : ""}`}>
                              <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                                {created.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              {mine && <DoubleCheck color="var(--muted)" />}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        className={`px-3.5 py-2 text-sm wrap-break-word ${
                          mine
                            ? `rounded-2xl ${isLastInGroup ? "rounded-br-sm" : ""} ${groupedWithPrev ? "rounded-tr-sm" : ""}`
                            : `rounded-2xl ${isLastInGroup ? "rounded-bl-sm" : ""} ${groupedWithPrev ? "rounded-tl-sm" : ""}`
                        }`}
                        style={{
                          background: mine ? "var(--bubble-out)" : "var(--bubble-in)",
                          color: mine ? "var(--bubble-out-text)" : "var(--text)",
                        }}
                      >
                        <TextScramble
                          as="div"
                          className="whitespace-pre-wrap"
                          duration={0.6}
                          speed={0.025}
                          trigger={new Date(m.createdAt).getTime() > pageMountRef.current}
                        >
                          {text}
                        </TextScramble>
                        {isLastInGroup && (
                          <div className={`mt-1 flex items-center gap-1 ${mine ? "justify-end" : ""}`}>
                            <span className="text-[10px] opacity-70">
                              {created.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {mine && (
                              <DoubleCheck color={mine ? "rgba(255,255,255,0.7)" : "var(--muted)"} />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
            </Fragment>
          );
        })}
        {/* Divider at end when session is active but no temp messages yet */}
        {loadingConvId !== id && isTempActive && !messages.some((m) => tempSince && new Date(m.createdAt) >= new Date(tempSince)) && (
          <div className="flex items-center gap-3 my-3 px-1">
            <div className="flex-1 h-px" style={{ background: "var(--border-strong)" }} />
            <span className="text-[11px] font-medium shrink-0" style={{ color: "var(--muted)" }}>
              Temporary Chat Started
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--border-strong)" }} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 px-4 py-3 border-t bg-surface shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        {/* Emoji button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors text-muted text-xl"
            aria-label="Emoji"
          >
            😊
          </button>
          {showEmoji && (
            <EmojiPickerPopover
              onPick={appendEmoji}
              onClose={() => setShowEmoji(false)}
            />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          placeholder="Message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 rounded-full py-2.5 px-5 text-sm outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        />

        <button
          type="submit"
          disabled={!text.trim()}
          className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40 transition-opacity"
          style={{ background: "var(--primary)" }}
          aria-label="Send"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </button>
      </form>
    </main>
  );
}
