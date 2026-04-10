"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "../lib/auth-store";
import { useChat } from "../lib/chat-store";
import { Conversation } from "../lib/api";
import { Avatar } from "./avatar";
import { SettingsDialog } from "./settings-dialog";

function convLabel(conv: Conversation, myId: string): string {
  if (conv.name) return conv.name;
  if (conv.type === "DIRECT") {
    const otherId = conv.memberIds.find((id) => id !== myId);
    if (otherId && conv.memberNames[otherId]) return conv.memberNames[otherId];
    return "Direct message";
  }
  return "Group";
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

interface Props {
  onNewChat: () => void;
}

export function Sidebar({ onNewChat }: Props) {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;
  const { user } = useAuth();
  const { conversations, loading, messagesByConv, unreadByConv } = useChat();
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const filtered = useMemo(() => {
    const myId = user?.id ?? "";
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
  }, [conversations, messagesByConv, query, user?.id]);

  const myId = user?.id ?? "";

  return (
    <>
      <div className="w-[320px] shrink-0 h-full flex flex-col border-r bg-surface overflow-hidden" style={{ borderColor: "var(--border)" }}>
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-base font-semibold">Chats</h2>
          <button
            onClick={onNewChat}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors text-muted"
            title="New message"
            aria-label="New message"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
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
              return (
                <li key={c.id}>
                  <button
                    onClick={() => router.push(`/app/chat/${c.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
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
                    <Avatar name={label} size={48} />
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
                        <span className="text-xs text-muted truncate">
                          {last?.ciphertext ?? "No messages yet"}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {c.temporary && (
                            <span className="text-[9px] uppercase tracking-widest rounded-full px-1.5 py-0.5" style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
                              Temp
                            </span>
                          )}
                          {unread > 0 && (
                            <span className="min-w-[20px] h-5 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center px-1 leading-none">
                              {unread > 99 ? "99+" : unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer — current user */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-3 px-4 py-3 border-t hover:bg-surface-hover transition-colors"
          style={{ borderColor: "var(--border)" }}
        >
          <Avatar name={user?.email ?? user?.displayName ?? "?"} size={36} />
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-medium truncate">{user?.displayName}</div>
            <div className="text-[11px] text-muted font-mono truncate">{user?.email}</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted shrink-0">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1-.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
