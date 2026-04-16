'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { ThemePref, useTheme } from '../lib/theme-store';
import { Avatar } from './avatar';
import {
  MorphingPopover,
  MorphingPopoverContent,
  MorphingPopoverTrigger,
} from './ui/morphing-popover';

export function SettingsPopover() {
  const { user, updateProfile, logout } = useAuth();
  const { preference, resolved, setPreference } = useTheme();

  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setDisplayName(user?.displayName ?? '');
      setError(null);
      setSaved(false);
    }
  }, [open, user]);

  const handleOpenChange = (next: boolean) => setOpen(next);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || displayName === user?.displayName) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfile({ displayName: displayName.trim() });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const themes: { value: ThemePref; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ];

  return (
    <MorphingPopover
      open={open}
      onOpenChange={handleOpenChange}
      className="relative w-full"
    >
      {/* Trigger: the entire user footer row */}
      <MorphingPopoverTrigger
        type="button"
        className="w-full flex items-center gap-10 px-4 py-3 border-t hover:bg-surface-hover transition-colors select-none"
        style={{ borderColor: 'var(--border)' }}
      >
        <Avatar name={user?.email ?? user?.displayName ?? '?'} size={36} />
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium truncate">{user?.displayName}</div>
          <div className="text-[11px] text-muted font-mono truncate">{user?.email}</div>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted shrink-0"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1-.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </MorphingPopoverTrigger>

      {/* Content: opens above the footer row */}
      <MorphingPopoverContent className="bottom-full left-0 right-0 mb-1">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border"
        style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold flex items-center">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted shrink-0"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1-.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
            &nbsp;Settings</h2>
          <button
            onClick={() => handleOpenChange(false)}
            className="rounded-full w-7 h-7 flex items-center justify-center hover:bg-surface-hover text-muted text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-5 px-4 py-4">
          <form onSubmit={onSave} className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-widest text-muted">
              Display name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                minLength={2}
                maxLength={40}
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-primary"
                style={{ borderColor: 'var(--border)' }}
              />
              <button
                type="submit"
                disabled={
                  saving ||
                  !displayName.trim() ||
                  displayName === user?.displayName
                }
                className="rounded-lg bg-primary text-on-primary px-3 text-sm font-medium disabled:opacity-50"
              >
                {saving ? '…' : 'Save'}
              </button>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            {saved && <p className="text-xs text-primary">Saved.</p>}
            <p className="text-xs text-muted font-mono">{user?.email}</p>
          </form>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-widest text-muted">
              Theme
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {themes.map((t) => {
                const active = preference === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setPreference(t.value)}
                    className={`rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                      active
                        ? 'border-primary bg-primary text-on-primary'
                        : 'border-border bg-surface-2 hover:bg-surface-hover'
                    }`}
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted">Currently: {resolved}</p>
          </div>

          <div className="border-t border-border pt-3"
          style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => {
                handleOpenChange(false);
                void logout();
              }}
              className="w-full rounded-lg border border-border hover:border-danger hover:text-danger px-4 py-2 text-sm font-medium transition-colors"
              style={{ borderColor: 'var(--border)' }}
            >
              Log out
            </button>
          </div>
        </div>
      </MorphingPopoverContent>
    </MorphingPopover>
  );
}
