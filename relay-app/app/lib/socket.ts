"use client";

import { io, Socket } from "socket.io-client";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000";

/**
 * Singleton socket. One connection per tab, shared across every hook
 * or component that calls getSocket().
 */
let current: Socket | null = null;
let currentToken: string | null = null;

export function getSocket(accessToken: string): Socket {
  if (current && currentToken === accessToken) return current;
  if (current) current.close();
  currentToken = accessToken;
  current = io(WS_URL, {
    auth: { token: accessToken },
    transports: ["polling", "websocket"],
    autoConnect: true,
  });
  return current;
}

export function closeSocket() {
  if (current) current.close();
  current = null;
  currentToken = null;
}
