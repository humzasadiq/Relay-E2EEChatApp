"use client";

import { create } from "zustand";
import { api, ChatMessage, Conversation, PublicUser } from "./api";
import { getSocket } from "./socket";

interface ChatState {
  conversations: Conversation[];
  activeId: string | null;
  messagesByConv: Record<string, ChatMessage[]>;
  unreadByConv: Record<string, number>;
  /** ISO timestamp when the temp session started, keyed by conversationId */
  tempSessionByConv: Record<string, string | null>;
  loading: boolean;

  loadConversations: (accessToken: string) => Promise<void>;
  openConversation: (accessToken: string, id: string) => Promise<void>;
  startDirect: (
    accessToken: string,
    other: PublicUser,
    options: { temporary: boolean },
  ) => Promise<Conversation>;
  sendMessage: (
    accessToken: string,
    conversationId: string,
    text: string,
  ) => Promise<void>;
  receive: (message: ChatMessage) => void;
  markRead: (conversationId: string) => void;
  setTempSession: (conversationId: string, since: string) => void;
  clearTempSession: (conversationId: string, since: string) => void;
  toggleTempSession: (accessToken: string, conversationId: string) => void;
  reset: () => void;
}

export const useChat = create<ChatState>((set, get) => ({
  conversations: [],
  activeId: null,
  messagesByConv: {},
  unreadByConv: {},
  tempSessionByConv: {},
  loading: false,

  async loadConversations(accessToken) {
    set({ loading: true });
    try {
      const conversations = await api.listConversations(accessToken);
      const socket = getSocket(accessToken);
      for (const c of conversations)
        socket.emit("chat:join", { conversationId: c.id });
      // Merge server temp-session state into the store.
      // We use a functional update so that any temp:started/temp:ended socket events
      // that arrived while the HTTP request was in-flight are not overwritten.
      // Server value wins only when it provides a non-null timestamp (active session).
      // A null from the server means the session ended — clear it.
      set((s) => {
        const merged: Record<string, string | null> = { ...s.tempSessionByConv };
        for (const c of conversations) {
          if (c.tempSessionSince) {
            merged[c.id] = c.tempSessionSince; // server has an active session
          } else if (merged[c.id] === undefined) {
            merged[c.id] = null; // no session, initialise key
          }
          // If merged[c.id] is already a string (set by socket event) and server says
          // null, keep the socket-driven value — it's more recent than the HTTP response.
        }
        return { conversations, tempSessionByConv: merged };
      });
    } finally {
      set({ loading: false });
    }
  },

  async openConversation(accessToken, id) {
    set({ activeId: id });
    get().markRead(id);
    const socket = getSocket(accessToken);
    socket.emit("chat:join", { conversationId: id });
    if (!get().messagesByConv[id]) {
      const history = await api.getHistory(accessToken, id);
      set((s) => ({
        messagesByConv: { ...s.messagesByConv, [id]: history },
      }));
    }
  },

  async startDirect(accessToken, other, { temporary }) {
    const conv = await api.createConversation(accessToken, {
      type: "DIRECT",
      memberIds: [other.id],
      temporary,
    });
    set((s) => ({ conversations: [conv, ...s.conversations] }));
    const socket = getSocket(accessToken);
    socket.emit("chat:join", { conversationId: conv.id });
    return conv;
  },

  async sendMessage(accessToken, conversationId, text) {
    const socket = getSocket(accessToken);
    // M2: plaintext in ciphertext slot. M3 swaps in real libsodium AES-GCM.
    socket.emit("chat:send", {
      conversationId,
      ciphertext: text,
      nonce: "plain",
    });
  },

  receive(message) {
    const activeId = get().activeId;
    set((s) => {
      const prev = s.messagesByConv[message.conversationId] ?? [];
      if (prev.some((m) => m.id === message.id)) return s;
      const isActive = activeId === message.conversationId;
      return {
        messagesByConv: {
          ...s.messagesByConv,
          [message.conversationId]: [...prev, message],
        },
        unreadByConv: {
          ...s.unreadByConv,
          [message.conversationId]: isActive
            ? 0
            : (s.unreadByConv[message.conversationId] ?? 0) + 1,
        },
      };
    });
  },

  markRead(conversationId) {
    set((s) => ({
      unreadByConv: { ...s.unreadByConv, [conversationId]: 0 },
    }));
  },

  setTempSession(conversationId, since) {
    set((s) => ({
      tempSessionByConv: { ...s.tempSessionByConv, [conversationId]: since },
    }));
  },

  clearTempSession(conversationId, since) {
    const sinceDate = new Date(since);
    set((s) => ({
      tempSessionByConv: { ...s.tempSessionByConv, [conversationId]: null },
      messagesByConv: {
        ...s.messagesByConv,
        [conversationId]: (s.messagesByConv[conversationId] ?? []).filter(
          (m) => new Date(m.createdAt) < sinceDate,
        ),
      },
    }));
  },

  toggleTempSession(accessToken, conversationId) {
    const socket = getSocket(accessToken);
    socket.emit("temp:toggle", { conversationId });
  },

  reset() {
    set({
      conversations: [],
      activeId: null,
      messagesByConv: {},
      unreadByConv: {},
      tempSessionByConv: {},
    });
  },
}));
