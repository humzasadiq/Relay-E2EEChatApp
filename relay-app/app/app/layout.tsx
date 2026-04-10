"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NavRail } from "../_components/nav-rail";
import { NewChatDialog } from "../_components/new-chat-dialog";
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
  const { receive, loadConversations, reset } = useChat();
  const [activeSection, setActiveSection] = useState<"chats" | "calls">("chats");
  const [newChatOpen, setNewChatOpen] = useState(false);

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
    const onMessage = (m: Parameters<typeof receive>[0]) => receive(m);
    socket.on("message:new", onMessage);
    loadConversations(accessToken);
    return () => {
      socket.off("message:new", onMessage);
    };
  }, [accessToken, receive, loadConversations]);

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
      <div className="flex flex-1 h-dvh overflow-hidden">
        {/* Column 1: slim icon nav rail */}
        <NavRail active={activeSection} onSelect={setActiveSection} />

        {/* Column 2: conversation sidebar */}
        <Sidebar onNewChat={() => setNewChatOpen(true)} />

        {/* Column 3: active chat / empty state */}
        <section className="flex-1 flex flex-col min-w-0 bg-background">
          {children}
        </section>
      </div>

      <NewChatDialog
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
      />
    </>
  );
}
