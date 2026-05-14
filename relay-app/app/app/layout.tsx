"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CallOverlay } from "../_components/call-overlay";
import { NavRail } from "../_components/nav-rail";
import { Sidebar } from "../_components/sidebar";
import { useAuth } from "../lib/auth-store";
import { useCallStore } from "../lib/call-store";
import { useChat } from "../lib/chat-store";
import { keyStore } from "../lib/key-store";
import { closeSocket, getSocket } from "../lib/socket";
import { useThemeSync } from "../lib/theme-store";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { status, user, accessToken, hydrate } = useAuth();
  const { receive, loadConversations, reset, setTempSession, clearTempSession, removeConversation, removeMessage, activeId } = useChat();
  const { setIncoming, _onAnswer, _onIceCandidate, _cleanup } = useCallStore();
  const pathname = usePathname();
  const isLearn = pathname.startsWith("/app/learn");
  const isOnChat = pathname.startsWith("/app/chat/");
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
    const onConvDeleted = (d: { conversationId: string }) => {
      removeConversation(d.conversationId);
      if (activeId === d.conversationId) router.replace("/app");
    };

    const onCallIncoming = (d: Parameters<typeof setIncoming>[0]) => setIncoming(d);
    const onCallAnswered = (d: { answer: RTCSessionDescriptionInit }) => void _onAnswer(d.answer);
    const onCallIceCandidate = (d: { candidate: RTCIceCandidateInit }) => void _onIceCandidate(d.candidate);
    const onCallEnded = () => _cleanup();
    const onCallRejected = () => _cleanup();

    // Group membership events
    const onMemberAdded = () => loadConversations(accessToken);
    const onMemberRemoved = (d: { conversationId: string }) => {
      keyStore.clearConversationKey(d.conversationId);
      loadConversations(accessToken);
    };
    const onKicked = (d: { conversationId: string }) => {
      removeConversation(d.conversationId);
      if (activeId === d.conversationId) router.replace("/app");
    };
    const onMessageDeleted = (d: { conversationId: string; messageId: string }) =>
      removeMessage(d.conversationId, d.messageId);

    socket.on("message:new", onMessage);
    socket.on("temp:started", onTempStarted);
    socket.on("temp:ended", onTempEnded);
    socket.on("connect", onConnect);
    socket.on("conv:new", onConvNew);
    socket.on("conv:deleted", onConvDeleted);
    socket.on("call:incoming", onCallIncoming);
    socket.on("call:answered", onCallAnswered);
    socket.on("call:ice-candidate", onCallIceCandidate);
    socket.on("call:ended", onCallEnded);
    socket.on("call:rejected", onCallRejected);
    socket.on("group:member-added", onMemberAdded);
    socket.on("group:member-removed", onMemberRemoved);
    socket.on("group:kicked", onKicked);
    socket.on("message:deleted", onMessageDeleted);
    loadConversations(accessToken);
    return () => {
      socket.off("message:new", onMessage);
      socket.off("temp:started", onTempStarted);
      socket.off("temp:ended", onTempEnded);
      socket.off("connect", onConnect);
      socket.off("conv:new", onConvNew);
      socket.off("conv:deleted", onConvDeleted);
      socket.off("call:incoming", onCallIncoming);
      socket.off("call:answered", onCallAnswered);
      socket.off("call:ice-candidate", onCallIceCandidate);
      socket.off("call:ended", onCallEnded);
      socket.off("call:rejected", onCallRejected);
      socket.off("group:member-added", onMemberAdded);
      socket.off("group:member-removed", onMemberRemoved);
      socket.off("group:kicked", onKicked);
      socket.off("message:deleted", onMessageDeleted);
    };
  }, [accessToken, receive, loadConversations, setTempSession, clearTempSession, removeConversation, removeMessage, activeId, router, setIncoming, _onAnswer, _onIceCandidate, _cleanup]);

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
      <div className="fixed inset-0 flex flex-col md:flex-row overflow-hidden">
        {/* Desktop: left nav rail */}
        <NavRail active={activeSection} onSelect={setActiveSection} />

        {/* Content row */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar: full-screen on mobile when no chat open; 320px panel on desktop */}
          {!isLearn && (
            <div className={`${isOnChat ? "hidden md:flex" : "flex"} flex-col w-full md:w-[320px] md:shrink-0 min-h-0`}>
              <Sidebar />
            </div>
          )}

          {/* Main content: hidden on mobile when sidebar is showing */}
          <section className={`${!isOnChat && !isLearn ? "hidden md:flex" : "flex"} flex-1 flex-col min-w-0 bg-background`}>
            {children}
          </section>
        </div>

      </div>
      {/* WebRTC call overlay — renders above everything when a call is active */}
      <CallOverlay />
    </>
  );
}
