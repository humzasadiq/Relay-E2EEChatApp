"use client";

import { create } from "zustand";
import { api, ChatMessage, Conversation, PublicUser } from "./api";
import { getSocket } from "./socket";

interface ChatState {
  conversations: Conversation[];
  activeId: string | null;
  messagesByConv: Record<string, ChatMessage[]>;
  unreadByConv: Record<string, number>;
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
  reset: () => void;
}

export const useChat = create<ChatState>((set, get) => ({
  conversations: [],
  activeId: null,
  messagesByConv: {},
  unreadByConv: {},
  loading: false,

  async loadConversations(accessToken) {
    set({ loading: true });
    try {
      const conversations = await api.listConversations(accessToken);
      set({ conversations });
      const socket = getSocket(accessToken);
      for (const c of conversations)
        socket.emit("chat:join", { conversationId: c.id });
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

  reset() {
    set({
      conversations: [],
      activeId: null,
      messagesByConv: {},
      unreadByConv: {},
    });
  },
}));
