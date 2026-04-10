"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-store";
import { ThemePref, useTheme } from "../lib/theme-store";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: Props) {
  const { user, updateProfile, logout } = useAuth();
  const { preference, resolved, setPreference } = useTheme();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setDisplayName(user?.displayName ?? "");
      setError(null);
      setSaved(false);
    }
  }, [open, user]);

  if (!open) return null;

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
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const themes: { value: ThemePref; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface border border-border-strong shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="rounded-full w-8 h-8 flex items-center justify-center hover:bg-surface-hover text-muted"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex flex-col gap-6 px-6 py-5">
          <form onSubmit={onSave} className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-widest text-muted">
              Display name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                minLength={2}
                maxLength={40}
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={
                  saving ||
                  !displayName.trim() ||
                  displayName === user?.displayName
                }
                className="rounded-lg bg-primary text-on-primary px-4 text-sm font-medium disabled:opacity-50"
              >
                {saving ? "…" : "Save"}
              </button>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            {saved && <p className="text-xs text-primary">Saved.</p>}
            <p className="text-xs text-muted font-mono">{user?.email}</p>
          </form>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-widest text-muted">
              Theme
            </label>
            <div className="grid grid-cols-3 gap-2">
              {themes.map((t) => {
                const active = preference === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setPreference(t.value)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      active
                        ? "border-primary bg-primary text-on-primary"
                        : "border-border bg-surface-2 hover:bg-surface-hover"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted">
              Currently using {resolved} theme.
            </p>
          </div>

          <div className="border-t border-border pt-4">
            <button
              onClick={() => {
                onClose();
                void logout();
              }}
              className="w-full rounded-lg border border-border hover:border-danger hover:text-danger px-4 py-2 text-sm font-medium transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
