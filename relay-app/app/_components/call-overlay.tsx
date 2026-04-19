"use client";

import { useEffect, useRef, useState } from "react";
import { useCallStore } from "../lib/call-store";
import { useAuth } from "../lib/auth-store";
import { useChat } from "../lib/chat-store";
import { Avatar } from "./avatar";

function formatDuration(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export function CallOverlay() {
  const { accessToken } = useAuth();
  const { conversations } = useChat();
  const {
    incoming,
    active,
    localStream,
    remoteStream,
    answerCall,
    rejectCall,
    hangup,
    toggleMute,
  } = useCallStore();

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!remoteStream) return;
    // Video call: attach to <video> (carries both video + audio tracks)
    if (active?.isVideo && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    // Audio-only call: attach to hidden <audio> element — without this the
    // remote stream is set in the store but nothing in the DOM plays it.
    if (!active?.isVideo && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, active?.isVideo]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (!active) {
      startTimeRef.current = null;
      setDuration(0);
      return;
    }
    if (!startTimeRef.current) startTimeRef.current = Date.now();
    const id = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current!) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  function peerName(peerId: string, conversationId: string): string {
    const conv = conversations.find((c) => c.id === conversationId);
    return conv?.memberNames[peerId] ?? peerId;
  }

  function peerEmail(peerId: string, conversationId: string): string {
    const conv = conversations.find((c) => c.id === conversationId);
    return conv?.memberEmails[peerId] ?? peerId;
  }

  /* ── Incoming call ──────────────────────────────────────────────── */
  if (incoming && !active) {
    const callerName = peerName(incoming.callerId, incoming.conversationId);
    const callerEmail = peerEmail(incoming.callerId, incoming.conversationId);
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center pb-10 pointer-events-none">
        <div
          className="pointer-events-auto rounded-3xl shadow-2xl flex flex-col items-center gap-6 px-10 py-8"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            minWidth: 300,
          }}
        >
          <Avatar name={callerEmail} size={72} />
          <div className="flex flex-col items-center gap-1">
            <span className="text-base font-semibold">{callerName}</span>
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              {incoming.isVideo ? "Incoming video call…" : "Incoming voice call…"}
            </span>
          </div>
          <div className="flex items-center gap-6">
            {/* Reject */}
            <button
              onClick={() => accessToken && rejectCall(accessToken)}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "#ef4444" }}
              aria-label="Decline"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.9 13.5a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 3.8 2.75h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.78 10.6" />
                <line x1="23" y1="1" x2="1" y2="23" />
              </svg>
            </button>
            {/* Accept */}
            <button
              onClick={() => accessToken && answerCall(accessToken)}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "#22c55e" }}
              aria-label="Accept"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.75h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Active call ────────────────────────────────────────────────── */
  if (active) {
    const name = peerName(active.peerId, active.conversationId);
    const email = peerEmail(active.peerId, active.conversationId);
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col"
        style={{ background: "#000" }}
      >
        {/* Hidden audio element — always present so voice-only calls play audio */}
        <audio ref={remoteAudioRef} autoPlay playsInline />

        {/* Remote video / audio-only fallback */}
        {active.isVideo ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4"
            style={{ background: "#0d0d1a" }}
          >
            <Avatar name={email} size={96} />
            <span className="text-white text-xl font-semibold">{name}</span>
            <span className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
              {formatDuration(duration)}
            </span>
          </div>
        )}

        {/* Caller info overlay (video mode) */}
        {active.isVideo && (
          <div className="absolute top-6 left-0 right-0 flex flex-col items-center gap-1 pointer-events-none">
            <span className="text-white text-lg font-semibold drop-shadow">
              {name}
            </span>
            <span
              className="text-sm drop-shadow"
              style={{ color: "rgba(255,255,255,0.7)" }}
            >
              {formatDuration(duration)}
            </span>
          </div>
        )}

        {/* Local video PiP (video mode only) */}
        {active.isVideo && (
          <div
            className="absolute top-6 right-4 w-28 h-40 rounded-2xl overflow-hidden shadow-2xl"
            style={{ border: "2px solid rgba(255,255,255,0.2)" }}
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-10 left-0 right-0 flex items-center justify-center gap-6">
          {/* Mute toggle */}
          <button
            onClick={toggleMute}
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{
              background: active.isMuted
                ? "rgba(255,255,255,0.9)"
                : "rgba(255,255,255,0.2)",
            }}
            aria-label={active.isMuted ? "Unmute" : "Mute"}
          >
            {active.isMuted ? (
              /* mic-off */
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#111"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              /* mic */
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

          {/* Hang up */}
          <button
            onClick={() => accessToken && hangup(accessToken)}
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "#ef4444" }}
            aria-label="Hang up"
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.9 13.5a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 3.8 2.75h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.78 10.6" />
              <line x1="23" y1="1" x2="1" y2="23" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return null;
}
