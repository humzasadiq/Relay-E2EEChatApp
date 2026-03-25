"use client";

import { useAuth } from "../lib/auth-store";

export default function AppHome() {
  const { user, logout } = useAuth();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 gap-8 text-center">
      <div className="flex flex-col gap-2 max-w-xl">
        <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">
          Relay
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome, {user?.displayName}
        </h1>
        <p className="text-zinc-500">
          You are logged in as{" "}
          <span className="font-mono">{user?.email}</span>. M2 will land real
          conversations here.
        </p>
      </div>

      <button
        onClick={logout}
        className="rounded-full border border-black/10 dark:border-white/15 px-6 py-3 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
      >
        Log out
      </button>
    </main>
  );
}
