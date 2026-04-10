import Link from "next/link";
import { RelayLogo } from "./_components/relay-logo";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 gap-10 text-center">
      <div className="flex flex-col items-center gap-6 max-w-xl">
        <RelayLogo size={64} />
        <div className="flex flex-col gap-3">
          <span className="text-xs uppercase tracking-[0.2em] text-muted">
            Relay
          </span>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            End-to-end encrypted chat.
          </h1>
          <p className="text-muted text-base sm:text-lg leading-relaxed">
            Realtime 1:1 and group messaging, WebRTC calls, and media sharing —
            the server only ever sees ciphertext.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
        <Link
          href="/login"
          className="flex-1 rounded-full bg-primary text-on-primary px-6 py-3 text-sm font-medium transition-opacity hover:opacity-90 text-center"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="flex-1 rounded-full border border-border-strong px-6 py-3 text-sm font-medium transition-colors hover:bg-surface-hover text-center"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
