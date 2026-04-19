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

type Tab = 'chat' | 'group';

function UserSearchRow({
  accessToken,
  excludeIds,
  actionLabel,
  onAction,
}: {
  accessToken: string;
  excludeIds: string[];
  actionLabel: string;
  onAction: (user: PublicUser) => void;
}) {
  const [email, setEmail] = useState('');
  const [candidate, setCandidate] = useState<PublicUser | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!email) return;
    setSearching(true);
    setError(null);
    setCandidate(null);
    try {
      const [found] = await api.searchUsers(accessToken, email);
      if (!found) setError('No user with that email.');
      else if (excludeIds.includes(found.id)) setError('Already in the conversation.');
      else setCandidate(found);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const commit = () => {
    if (!candidate) return;
    onAction(candidate);
    setEmail('');
    setCandidate(null);
    setError(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }}
          autoFocus
          className="flex-1 rounded-lg border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-primary"
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
        <div
          className="rounded-xl border bg-surface-2 p-2.5 flex items-center gap-2.5"
          style={{ borderColor: 'var(--border)' }}
        >
          <Avatar name={candidate.email} size={32} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{candidate.displayName}</div>
            <div className="text-xs text-muted truncate">{candidate.email}</div>
          </div>
          <button
            onClick={commit}
            className="shrink-0 rounded-lg bg-primary text-on-primary px-2.5 py-1 text-xs font-medium"
          >
            {actionLabel}
          </button>
        </div>
      )}
      {error && <p className="text-xs" style={{ color: 'var(--danger, #ef4444)' }}>{error}</p>}
    </div>
  );
}

export function NewChatPopover() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const { startDirect, startGroup } = useChat();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('chat');

  // — Direct chat state —
  const [directCandidate, setDirectCandidate] = useState<PublicUser | null>(null);
  const [directError, setDirectError] = useState<string | null>(null);

  // — Group state —
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<PublicUser[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setTab('chat');
    setDirectCandidate(null);
    setDirectError(null);
    setGroupName('');
    setGroupMembers([]);
    setGroupError(null);
    setCreating(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    setOpen(next);
  };

  const startChat = async () => {
    if (!accessToken || !user || !directCandidate) return;
    try {
      const conv = await startDirect(accessToken, user, directCandidate, { temporary: false });
      handleOpenChange(false);
      router.push(`/app/chat/${conv.id}`);
    } catch (e) {
      setDirectError(e instanceof ApiError ? e.message : 'Could not start chat');
    }
  };

  const createGroup = async () => {
    if (!accessToken || !user || !groupName.trim() || groupMembers.length === 0) return;
    setCreating(true);
    setGroupError(null);
    try {
      const conv = await startGroup(accessToken, user, groupMembers, groupName.trim());
      handleOpenChange(false);
      router.push(`/app/chat/${conv.id}`);
    } catch (e) {
      setGroupError(e instanceof ApiError ? e.message : 'Could not create group');
    } finally {
      setCreating(false);
    }
  };

  const removeMemberFromList = (id: string) =>
    setGroupMembers((prev) => prev.filter((m) => m.id !== id));

  const directExcludeIds = user ? [user.id, ...(directCandidate ? [directCandidate.id] : [])] : [];
  const groupExcludeIds = user ? [user.id, ...groupMembers.map((m) => m.id)] : [];

  return (
    <MorphingPopover open={open} onOpenChange={handleOpenChange}>
      <MorphingPopoverTrigger
        type="button"
        className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors text-muted"
        title="New message"
        aria-label="New message"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" /><path d="M12 5v14" />
        </svg>
      </MorphingPopoverTrigger>

      <MorphingPopoverContent className="top-full right-0 mt-2 w-[320px]">
        {/* Header */}
        <header
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          {/* Tabs */}
          <div className="flex gap-1 rounded-lg p-0.5" style={{ background: 'var(--surface-2)' }}>
            {(['chat', 'group'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="rounded-md px-3 py-1 text-xs font-medium transition-colors capitalize"
                style={{
                  background: tab === t ? 'var(--surface)' : 'transparent',
                  color: tab === t ? 'var(--text)' : 'var(--muted)',
                  boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {t === 'chat' ? 'New Chat' : 'New Group'}
              </button>
            ))}
          </div>
          <button
            onClick={() => handleOpenChange(false)}
            className="rounded-full w-7 h-7 flex items-center justify-center hover:bg-surface-hover text-muted text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {/* ── New Chat tab ── */}
        {tab === 'chat' && (
          <>
            <div className="px-4 py-3">
              <UserSearchRow
                accessToken={accessToken ?? ''}
                excludeIds={directExcludeIds}
                actionLabel="Select"
                onAction={(u) => { setDirectCandidate(u); setDirectError(null); }}
              />
              {directCandidate && (
                <div
                  className="mt-2 rounded-xl border bg-surface-2 p-2.5 flex items-center gap-2.5"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <Avatar name={directCandidate.email} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{directCandidate.displayName}</div>
                    <div className="text-xs text-muted truncate">{directCandidate.email}</div>
                  </div>
                  <button
                    onClick={() => setDirectCandidate(null)}
                    className="text-muted text-lg leading-none hover:text-danger"
                    aria-label="Remove"
                  >×</button>
                </div>
              )}
              {directError && <p className="mt-1 text-xs" style={{ color: 'var(--danger, #ef4444)' }}>{directError}</p>}
            </div>
            <div
              className="flex justify-end gap-2 px-4 py-3 border-t"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <button onClick={() => handleOpenChange(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-surface-hover">Cancel</button>
              <button
                onClick={startChat}
                disabled={!directCandidate}
                className="rounded-lg bg-primary text-on-primary px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >Start chat</button>
            </div>
          </>
        )}

        {/* ── New Group tab ── */}
        {tab === 'group' && (
          <>
            <div className="flex flex-col gap-3 px-4 py-3">
              {/* Group name */}
              <input
                type="text"
                placeholder="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={60}
                className="rounded-lg border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-primary"
                style={{ borderColor: 'var(--border)' }}
              />

              {/* Member search */}
              <UserSearchRow
                accessToken={accessToken ?? ''}
                excludeIds={groupExcludeIds}
                actionLabel="Add"
                onAction={(u) => setGroupMembers((prev) => [...prev, u])}
              />

              {/* Added members list */}
              {groupMembers.length > 0 && (
                <div className="flex flex-col gap-1">
                  {groupMembers.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                      style={{ background: 'var(--surface-2)' }}
                    >
                      <Avatar name={m.email} size={26} />
                      <span className="flex-1 text-sm truncate">{m.displayName}</span>
                      <button
                        onClick={() => removeMemberFromList(m.id)}
                        className="text-muted hover:text-danger text-base leading-none"
                        aria-label={`Remove ${m.displayName}`}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
              {groupError && <p className="text-xs" style={{ color: 'var(--danger, #ef4444)' }}>{groupError}</p>}
            </div>
            <div
              className="flex justify-end gap-2 px-4 py-3 border-t"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <button onClick={() => handleOpenChange(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-surface-hover">Cancel</button>
              <button
                onClick={createGroup}
                disabled={creating || !groupName.trim() || groupMembers.length === 0}
                className="rounded-lg bg-primary text-on-primary px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create group'}
              </button>
            </div>
          </>
        )}
      </MorphingPopoverContent>
    </MorphingPopover>
  );
}
