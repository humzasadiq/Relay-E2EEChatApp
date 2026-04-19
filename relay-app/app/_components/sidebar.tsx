"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "../lib/auth-store";
import { useChat } from "../lib/chat-store";
import { Conversation } from "../lib/api";
import { Avatar } from "./avatar";
import { NewChatPopover } from "./new-chat-popover";
import { SettingsPopover } from "./settings-popover";
import { TextScramble } from "./ui/text-scramble";

function convLabel(conv: Conversation, myId: string): string {
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

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor(
    (now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) /
      86400000,
  );
  if (diffDays === 0)
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function Sidebar() {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;
  const { user, accessToken } = useAuth();
  const { conversations, loading, messagesByConv, unreadByConv, deleteConversation } = useChat();
  const [query, setQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const myId = user?.id ?? "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...conversations].sort((a, b) => {
      const lastA = messagesByConv[a.id]?.at(-1)?.createdAt ?? a.createdAt;
      const lastB = messagesByConv[b.id]?.at(-1)?.createdAt ?? b.createdAt;
      return new Date(lastB).getTime() - new Date(lastA).getTime();
    });
    if (!q) return sorted;
    return sorted.filter((c) =>
      convLabel(c, myId).toLowerCase().includes(q),
    );
  }, [conversations, messagesByConv, query, myId]);

  async function handleDelete(convId: string) {
    setConfirmDeleteId(null);
    if (!accessToken) return;
    await deleteConversation(accessToken, convId);
    if (activeId === convId) router.replace("/app");
  }

  return (
    <div className="w-[320px] shrink-0 flex flex-col border-r bg-surface" style={{ borderColor: "var(--border)" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-base font-semibold">Chats</h2>
        <NewChatPopover />
      </header>

      {/* Search */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 rounded-full px-3.5 py-2" style={{ background: "var(--surface-2)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted shrink-0">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </div>
      </div>

      {/* List */}
      <nav className="flex-1 overflow-y-auto min-h-0">
        {loading && conversations.length === 0 && (
          <p className="text-xs text-muted px-4 py-8 text-center">Loading…</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-xs text-muted px-4 py-8 text-center">
            {query ? "No matches." : "No conversations yet."}
          </p>
        )}
        <ul>
          {filtered.map((c) => {
            const label = convLabel(c, myId);
            const msgs = messagesByConv[c.id] ?? [];
            const last = msgs.at(-1);
            const unread = unreadByConv[c.id] ?? 0;
            const isActive = activeId === c.id;
            const isConfirming = confirmDeleteId === c.id;

            if (isConfirming) {
              return (
                <li key={c.id}>
                  <div
                    className="flex items-center gap-2 px-4 py-3"
                    style={{ background: "color-mix(in srgb, #e53e3e 8%, transparent)" }}
                  >
                    <span className="flex-1 text-sm truncate" style={{ color: "#e53e3e" }}>
                      Delete &ldquo;{label}&rdquo;?
                    </span>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full transition-opacity"
                      style={{ background: "#e53e3e", color: "white" }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full"
                      style={{ background: "var(--surface-2)", color: "var(--text)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </li>
              );
            }

            return (
              <li key={c.id}>
                <div
                  className="flex items-center group"
                  style={{
                    background: isActive
                      ? "color-mix(in srgb, var(--primary) 12%, transparent)"
                      : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <button
                    onClick={() => router.push(`/app/chat/${c.id}`)}
                    className="flex-1 flex items-center gap-3 px-4 py-3 text-left min-w-0"
                  >
                    <Avatar name={convAvatarSeed(c, myId)} size={48} variant={c.type === "GROUP" ? "pixel" : "beam"} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1">
                        <span
                          className="text-sm truncate"
                          style={{ fontWeight: unread > 0 ? 700 : 500 }}
                        >
                          {label}
                        </span>
                        {last && (
                          <span
                            className="text-[11px] shrink-0"
                            style={{ color: unread > 0 ? "var(--primary)" : "var(--muted)" }}
                          >
                            {formatTime(last.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <TextScramble
                          key={last?.id ?? "empty"}
                          as="span"
                          className="text-xs text-muted truncate block max-w-full"
                          duration={0.6}
                          speed={0.025}
                          trigger={!!last}
                        >
                          {last?.text ?? (last ? "…" : "No messages yet")}
                        </TextScramble>
                        <div className="flex items-center gap-1 shrink-0">
                          {c.temporary && (
                            <span className="text-[9px] uppercase tracking-widest rounded-full px-1.5 py-0.5" style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
                              Temp
                            </span>
                          )}
                          {unread > 0 && (
                            <span className="min-w-5 h-5 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center px-1 leading-none">
                              {unread > 99 ? "99+" : unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Trash button — visible on hover */}
                  <button
                    onClick={() => setConfirmDeleteId(c.id)}
                    title="Delete chat"
                    className="opacity-0 group-hover:opacity-100 mr-3 w-7 h-7 shrink-0 rounded-full flex items-center justify-center transition-opacity"
                    style={{ color: "var(--muted)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.color = "#e53e3e";
                      (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, #e53e3e 12%, transparent)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.color = "var(--muted)";
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer — current user / settings */}
      <SettingsPopover />
    </div>
  );
}
