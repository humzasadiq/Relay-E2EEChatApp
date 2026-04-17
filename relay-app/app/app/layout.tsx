"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavRail } from "../_components/nav-rail";
import { Sidebar } from "../_components/sidebar";
import { useAuth } from "../lib/auth-store";
import { useChat } from "../lib/chat-store";
import { closeSocket, getSocket } from "../lib/socket";
import { useThemeSync } from "../lib/theme-store";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { status, user, accessToken, hydrate } = useAuth();
  const { receive, loadConversations, reset, setTempSession, clearTempSession } = useChat();
  const pathname = usePathname();
  const isLearn = pathname.startsWith("/app/learn");
  const [activeSection, setActiveSection] = useState<"chats" | "calls" | "learn">("chats");

  useThemeSync();

  useEffect(() => {
    if (status === "idle") hydrate();
  }, [status, hydrate]);

  useEffect(() => {
    if (status === "ready" && !user) router.replace("/login");
  }, [status, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    const socket = getSocket(accessToken);
    const onMessage = (m: Parameters<typeof receive>[1]) =>
      void receive(accessToken, m);
    const onTempStarted = (d: { conversationId: string; since: string }) =>
      setTempSession(d.conversationId, d.since);
    const onTempEnded = (d: { conversationId: string; since: string }) =>
      clearTempSession(d.conversationId, d.since);
    // On reconnect, re-join all rooms and refresh conversation state
    // (this picks up any temp session that was started while disconnected)
    const onConnect = () => loadConversations(accessToken);
    // When another user starts a chat with us, refresh the conversation list
    const onConvNew = () => loadConversations(accessToken);

    socket.on("message:new", onMessage);
    socket.on("temp:started", onTempStarted);
    socket.on("temp:ended", onTempEnded);
    socket.on("connect", onConnect);
    socket.on("conv:new", onConvNew);
    loadConversations(accessToken);
    return () => {
      socket.off("message:new", onMessage);
      socket.off("temp:started", onTempStarted);
      socket.off("temp:ended", onTempEnded);
      socket.off("connect", onConnect);
      socket.off("conv:new", onConvNew);
    };
  }, [accessToken, receive, loadConversations, setTempSession, clearTempSession]);

  useEffect(() => {
    return () => {
      if (!accessToken) {
        reset();
        closeSocket();
      }
    };
  }, [accessToken, reset]);

  if (status !== "ready" || !user) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted">
        Loading…
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 flex overflow-hidden">
        {/* Column 1: slim icon nav rail */}
        <NavRail active={activeSection} onSelect={setActiveSection} />

        {/* Column 2: conversation sidebar — hidden on the learn page */}
        {!isLearn && <Sidebar />}

        {/* Column 3: active chat / learn page / empty state */}
        <section className="flex-1 flex flex-col min-w-0 bg-background">
          {children}
        </section>
      </div>
    </>
  );
}
