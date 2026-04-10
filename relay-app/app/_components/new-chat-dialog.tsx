"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, PublicUser } from "../lib/api";
import { useAuth } from "../lib/auth-store";
import { useChat } from "../lib/chat-store";
import { Avatar } from "./avatar";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NewChatDialog({ open, onClose }: Props) {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { startDirect } = useChat();

  const [email, setEmail] = useState("");
  const [temporary, setTemporary] = useState(false);
  const [candidate, setCandidate] = useState<PublicUser | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setEmail("");
    setCandidate(null);
    setTemporary(false);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const search = async () => {
    if (!accessToken || !email) return;
    setSearching(true);
    setError(null);
    setCandidate(null);
    try {
      const [user] = await api.searchUsers(accessToken, email);
      if (!user) setError("No user with that email.");
      else setCandidate(user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const startChat = async () => {
    if (!accessToken || !candidate) return;
    try {
      const conv = await startDirect(accessToken, candidate, { temporary });
      close();
      router.push(`/app/chat/${conv.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start chat");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-surface border border-border-strong shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold">New chat</h2>
            <p className="text-xs text-muted">Find an existing Relay user.</p>
          </div>
          <button
            onClick={close}
            className="rounded-full w-8 h-8 flex items-center justify-center hover:bg-surface-hover text-muted"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={search}
              disabled={searching || !email}
              className="rounded-lg bg-primary text-on-primary px-4 text-sm font-medium disabled:opacity-50"
            >
              {searching ? "…" : "Find"}
            </button>
          </div>

          {candidate && (
            <div className="rounded-xl border border-border bg-surface-2 p-3 flex items-center gap-3">
              <Avatar name={candidate.displayName} size={40} />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {candidate.displayName}
                </div>
                <div className="text-xs text-muted font-mono truncate">
                  {candidate.email}
                </div>
              </div>
            </div>
          )}

          <label className="flex items-start gap-3 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={temporary}
              onChange={(e) => setTemporary(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="font-medium">Temporary chat</span>
              <span className="block text-xs text-muted">
                Kept in server memory only — wiped on restart.
              </span>
            </span>
          </label>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border bg-surface-2">
          <button
            onClick={close}
            className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            onClick={startChat}
            disabled={!candidate}
            className="rounded-lg bg-primary text-on-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Start chat
          </button>
        </div>
      </div>
    </div>
  );
}
