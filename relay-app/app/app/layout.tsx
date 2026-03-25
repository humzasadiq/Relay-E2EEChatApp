"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../lib/auth-store";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { status, user, hydrate } = useAuth();

  useEffect(() => {
    if (status === "idle") hydrate();
  }, [status, hydrate]);

  useEffect(() => {
    if (status === "ready" && !user) router.replace("/login");
  }, [status, user, router]);

  if (status !== "ready" || !user) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
