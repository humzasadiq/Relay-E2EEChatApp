"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "../lib/auth-store";

interface Props {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: Props) {
  const router = useRouter();
  const { login, signup } = useAuth();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (mode === "signup") {
        await signup({ email, displayName, password });
      } else {
        await login({ email, password });
      }
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {mode === "signup" && (
        <input
          type="text"
          placeholder="Display name"
          required
          minLength={2}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-4 py-3 text-sm outline-none focus:border-black/30 dark:focus:border-white/30"
        />
      )}
      <input
        type="email"
        placeholder="Email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-4 py-3 text-sm outline-none focus:border-black/30 dark:focus:border-white/30"
      />
      <input
        type="password"
        placeholder="Password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-4 py-3 text-sm outline-none focus:border-black/30 dark:focus:border-white/30"
      />
      {error && (
        <p className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-foreground text-background px-6 py-3 text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "…" : mode === "signup" ? "Create account" : "Log in"}
      </button>
    </form>
  );
}
