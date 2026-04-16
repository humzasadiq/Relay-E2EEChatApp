'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, PublicUser } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useChat } from '../lib/chat-store';
import { Avatar } from './avatar';
import {
  MorphingPopover,
  MorphingPopoverContent,
  MorphingPopoverTrigger,
} from './ui/morphing-popover';

export function NewChatPopover() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const { startDirect } = useChat();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [candidate, setCandidate] = useState<PublicUser | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setEmail('');
      setCandidate(null);
      setError(null);
    }
    setOpen(next);
  };

  const search = async () => {
    if (!accessToken || !email) return;
    setSearching(true);
    setError(null);
    setCandidate(null);
    try {
      const [user] = await api.searchUsers(accessToken, email);
      if (!user) setError('No user with that email.');
      else setCandidate(user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const startChat = async () => {
    if (!accessToken || !user || !candidate) return;
    try {
      const conv = await startDirect(accessToken, user, candidate, {
        temporary: false,
      });
      handleOpenChange(false);
      router.push(`/app/chat/${conv.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start chat');
    }
  };

  return (
    <MorphingPopover open={open} onOpenChange={handleOpenChange}>
      <MorphingPopoverTrigger
        type="button"
        className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors text-muted"
        title="New message"
        aria-label="New message"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus-icon lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
      </MorphingPopoverTrigger>

      <MorphingPopoverContent className="top-full right-0 mt-2 w-[300px]">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border"
        style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-sm font-semibold flex items-center text-muted">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus-icon lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            &nbsp;New chat</h2>
            <p className="text-xs text-muted">Find an existing Relay user.</p>
          </div>
          <button
            onClick={() => handleOpenChange(false)}
            className="rounded-full w-7 h-7 flex items-center justify-center hover:bg-surface-hover text-muted text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex flex-col gap-3 px-4 py-3">
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void search();
                }
              }}
              autoFocus
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-primary"
              style={{ borderColor: 'var(--border)' }}
            />
            <button
              onClick={search}
              disabled={searching || !email}
              className="rounded-lg bg-primary text-on-primary px-3 text-sm font-medium disabled:opacity-50"
            >
              {searching ? '…' : 'Find'}
            </button>
          </div>

          {candidate && (
            <div className="rounded-xl border border-border bg-surface-2 p-2.5 flex items-center gap-2.5"
            style={{ borderColor: 'var(--border)' }}>
              <Avatar name={candidate.email} size={36} />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{candidate.displayName}</div>
                <div className="text-xs text-muted font-mono truncate">{candidate.email}</div>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-surface-2"
        style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => handleOpenChange(false)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            onClick={startChat}
            disabled={!candidate}
            className="rounded-lg bg-primary text-on-primary px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Start chat
          </button>
        </div>
      </MorphingPopoverContent>
    </MorphingPopover>
  );
}
