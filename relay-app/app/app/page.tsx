"use client";

export default function AppHome() {
  return (
    <main className="flex-1 flex items-center justify-center px-8 text-center">
      <div className="flex flex-col items-center gap-4 max-w-md">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{
            background:
              "linear-gradient(135deg, var(--primary), var(--accent))",
          }}
        >
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold">Welcome to Relay</h1>
        <p className="text-sm text-muted leading-relaxed">
          Select a conversation from the sidebar, or tap + to start a new one.
          Messages are end-to-end encrypted — the server only ever sees
          ciphertext.
        </p>
      </div>
    </main>
  );
}
