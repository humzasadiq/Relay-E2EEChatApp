import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 gap-10 text-center">
      <div className="flex flex-col gap-4 max-w-xl">
        <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">
          Relay
        </span>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
          End-to-end encrypted chat.
        </h1>
        <p className="text-zinc-500 text-base sm:text-lg leading-relaxed">
          Realtime 1:1 and group messaging, WebRTC calls, and media sharing —
          the server only ever sees ciphertext.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
        <Link
          href="/login"
          className="flex-1 rounded-full bg-foreground text-background px-6 py-3 text-sm font-medium transition-colors hover:opacity-90"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="flex-1 rounded-full border border-black/10 dark:border-white/15 px-6 py-3 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
