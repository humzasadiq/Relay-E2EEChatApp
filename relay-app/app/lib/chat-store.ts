"use client";

import { create } from "zustand";
import { api, ChatMessage, Conversation, PublicUser } from "./api";
import {
  decryptMessage,
  encryptMessage,
  generateConversationKey,
  unwrapConversationKey,
  wrapConversationKey,
} from "./crypto";
import { keyStore } from "./key-store";
import { getSocket } from "./socket";

interface ChatState {
  conversations: Conversation[];
  activeId: string | null;
  messagesByConv: Record<string, ChatMessage[]>;
  /** Conversations whose full history has been fetched */
  historyLoadedConvs: Record<string, true>;
  /** ID of the conversation currently having its history fetched */
  loadingConvId: string | null;
  unreadByConv: Record<string, number>;
  /** ISO timestamp when the temp session started, keyed by conversationId */
  tempSessionByConv: Record<string, string | null>;
  loading: boolean;

  loadConversations: (accessToken: string) => Promise<void>;
  openConversation: (accessToken: string, id: string) => Promise<void>;
  startDirect: (
    accessToken: string,
    me: PublicUser,
    other: PublicUser,
    options: { temporary: boolean },
  ) => Promise<Conversation>;
  startGroup: (
    accessToken: string,
    me: PublicUser,
    members: PublicUser[],
    name: string,
  ) => Promise<Conversation>;
  addGroupMember: (
    accessToken: string,
    conversationId: string,
    newMember: PublicUser,
  ) => Promise<void>;
  removeGroupMember: (
    accessToken: string,
    conversationId: string,
    userId: string,
  ) => Promise<void>;
  patchConversation: (updated: Conversation) => void;
  sendMessage: (
    accessToken: string,
    conversationId: string,
    text: string,
  ) => Promise<void>;
  receive: (accessToken: string, message: ChatMessage) => Promise<void>;
  markRead: (conversationId: string) => void;
  setTempSession: (conversationId: string, since: string) => void;
  clearTempSession: (conversationId: string, since: string) => void;
  toggleTempSession: (accessToken: string, conversationId: string) => void;
  deleteConversation: (accessToken: string, id: string) => Promise<void>;
  removeConversation: (id: string) => void;
  reset: () => void;
}

/**
 * Provision a conversation key for a conversation that was created
 * before M3 (or otherwise has no wrapped keys on the server). Generates
 * a fresh key, wraps it for every member using their public exchange
 * key, and persists the wrapped copies. Returns the raw key.
 */
async function provisionConversationKey(
  accessToken: string,
  conversationId: string,
  memberIds: string[],
): Promise<string | null> {
  const convKey = await generateConversationKey();
  const wrappedKeys: Record<string, string> = {};
  for (const memberId of memberIds) {
    const { exchangePubKey } = await api.getUserKeys(accessToken, memberId);
    if (!exchangePubKey) return null;
    wrappedKeys[memberId] = await wrapConversationKey(convKey, exchangePubKey);
  }
  await api.upsertConversationKeys(accessToken, conversationId, wrappedKeys);
  return convKey;
}

/**
 * Return the unwrapped conversation key, fetching and unwrapping once
 * per session if needed. Returns null when the viewer lacks the
 * private keys to unwrap (e.g. page refresh before password re-entry).
 */
async function ensureConversationKey(
  accessToken: string,
  conversationId: string,
  memberIdsIfMissing?: string[],
): Promise<string | null> {
  const cached = keyStore.getConversationKey(conversationId);
  if (cached) return cached;
  const priv = keyStore.getPrivateBundle();
  if (!priv) return null;
  const { wrappedKey } = await api.getMyWrappedKey(accessToken, conversationId);
  if (wrappedKey) {
    const convKey = await unwrapConversationKey(
      wrappedKey,
      priv.exchangePubKey,
      priv.exchangePrivKey,
    );
    keyStore.setConversationKey(conversationId, convKey);
    return convKey;
  }
  // Legacy conversation with no wrapped keys — provision one now so
  // future messages are encrypted. Only possible when we know the
  // member list (caller provides it for known conversations).
  if (!memberIdsIfMissing || memberIdsIfMissing.length === 0) return null;
  const convKey = await provisionConversationKey(
    accessToken,
    conversationId,
    memberIdsIfMissing,
  );
  if (convKey) keyStore.setConversationKey(conversationId, convKey);
  return convKey;
}

/**
 * Pre-M3 messages were stored as plaintext in the `ciphertext` column
 * with `nonce === "plain"`. Render those verbatim instead of trying to
 * decrypt them.
 */
function isLegacyPlaintext(msg: ChatMessage): boolean {
  return msg.nonce === "plain";
}

async function tryDecrypt(
  accessToken: string,
  msg: ChatMessage,
  memberIdsIfMissing?: string[],
): Promise<ChatMessage> {
  if (msg.text !== undefined) return msg;
  if (isLegacyPlaintext(msg)) return { ...msg, text: msg.ciphertext };
  const convKey = await ensureConversationKey(
    accessToken,
    msg.conversationId,
    memberIdsIfMissing,
  );
  if (!convKey) return { ...msg, text: "…" };
  try {
    const text = await decryptMessage(msg.ciphertext, msg.nonce, convKey);
    return { ...msg, text };
  } catch {
    return { ...msg, text: "⚠ decryption failed" };
  }
}

export const useChat = create<ChatState>((set, get) => ({
  conversations: [],
  activeId: null,
  messagesByConv: {},
  historyLoadedConvs: {},
  loadingConvId: null,
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
      set((s) => {
        const merged: Record<string, string | null> = { ...s.tempSessionByConv };
        for (const c of conversations) {
          if (c.tempSessionSince) {
            merged[c.id] = c.tempSessionSince;
          } else if (merged[c.id] === undefined) {
            merged[c.id] = null;
          }
        }
        return { conversations, tempSessionByConv: merged };
      });
    } finally {
      set({ loading: false });
    }
    // Decrypt last-message previews in the background (after loading clears)
    const convs = get().conversations;
    await Promise.all(
      convs
        .filter((c) => c.lastMessage && !get().historyLoadedConvs[c.id])
        .map(async (c) => {
          const decrypted = await tryDecrypt(accessToken, c.lastMessage!, c.memberIds);
          set((s) => {
            if (s.historyLoadedConvs[c.id]) return s;
            return { messagesByConv: { ...s.messagesByConv, [c.id]: [decrypted] } };
          });
        }),
    );
  },

  async openConversation(accessToken, id) {
    set({ activeId: id });
    get().markRead(id);
    const socket = getSocket(accessToken);
    socket.emit("chat:join", { conversationId: id });
    if (!get().historyLoadedConvs[id]) {
      set({ loadingConvId: id });
      try {
        const history = await api.getHistory(accessToken, id);
        const conv = get().conversations.find((c) => c.id === id);
        const memberIds = conv?.memberIds;
        const decrypted = await Promise.all(
          history.map((m) => tryDecrypt(accessToken, m, memberIds)),
        );
        set((s) => ({
          messagesByConv: { ...s.messagesByConv, [id]: decrypted },
          historyLoadedConvs: { ...s.historyLoadedConvs, [id]: true },
          loadingConvId: null,
        }));
      } catch {
        set({ loadingConvId: null });
      }
    }
  },

  async startDirect(accessToken, me, other, { temporary }) {
    const priv = keyStore.getPrivateBundle();
    if (!priv) throw new Error("Keys not ready — please log in again.");
    const otherExchangePub =
      other.exchangePubKey ??
      (await api.getUserKeys(accessToken, other.id)).exchangePubKey;
    if (!otherExchangePub) {
      throw new Error("Recipient has no encryption keys yet.");
    }
    const convKey = await generateConversationKey();
    const wrappedKeys: Record<string, string> = {
      [me.id]: await wrapConversationKey(convKey, priv.exchangePubKey),
      [other.id]: await wrapConversationKey(convKey, otherExchangePub),
    };
    const conv = await api.createConversation(accessToken, {
      type: "DIRECT",
      memberIds: [other.id],
      temporary,
      wrappedKeys,
    });
    // Skip the round-trip on first use by caching the raw key.
    keyStore.setConversationKey(conv.id, convKey);
    set((s) => ({ conversations: [conv, ...s.conversations] }));
    const socket = getSocket(accessToken);
    socket.emit("chat:join", { conversationId: conv.id });
    return conv;
  },

  async startGroup(accessToken, me, members, name) {
    const priv = keyStore.getPrivateBundle();
    if (!priv) throw new Error("Keys not ready — please log in again.");
    const convKey = await generateConversationKey();
    const wrappedKeys: Record<string, string> = {
      [me.id]: await wrapConversationKey(convKey, priv.exchangePubKey),
    };
    for (const member of members) {
      const exchangePubKey =
        member.exchangePubKey ??
        (await api.getUserKeys(accessToken, member.id)).exchangePubKey;
      if (!exchangePubKey)
        throw new Error(`${member.displayName} has no encryption keys yet.`);
      wrappedKeys[member.id] = await wrapConversationKey(convKey, exchangePubKey);
    }
    const conv = await api.createConversation(accessToken, {
      type: "GROUP",
      name,
      memberIds: members.map((m) => m.id),
      wrappedKeys,
    });
    keyStore.setConversationKey(conv.id, convKey);
    set((s) => ({ conversations: [conv, ...s.conversations] }));
    const socket = getSocket(accessToken);
    socket.emit("chat:join", { conversationId: conv.id });
    return conv;
  },

  async addGroupMember(accessToken, conversationId, newMember) {
    const conv = get().conversations.find((c) => c.id === conversationId);
    if (!conv) return;
    const convKey = await ensureConversationKey(accessToken, conversationId, conv.memberIds);
    if (!convKey) throw new Error("Cannot access conversation key.");
    const exchangePubKey =
      newMember.exchangePubKey ??
      (await api.getUserKeys(accessToken, newMember.id)).exchangePubKey;
    if (!exchangePubKey) throw new Error(`${newMember.displayName} has no encryption keys yet.`);
    const wrappedKey = await wrapConversationKey(convKey, exchangePubKey);
    const updated = await api.addGroupMember(accessToken, conversationId, newMember.id, wrappedKey);
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === conversationId ? updated : c)),
    }));
  },

  async removeGroupMember(accessToken, conversationId, userId) {
    const conv = get().conversations.find((c) => c.id === conversationId);
    if (!conv) return;
    await api.removeGroupMember(accessToken, conversationId, userId);
    // Rotate key: generate fresh one and wrap for all remaining members
    const remainingIds = conv.memberIds.filter((id) => id !== userId);
    const newKey = await generateConversationKey();
    const wrappedKeys: Record<string, string> = {};
    for (const memberId of remainingIds) {
      const { exchangePubKey } = await api.getUserKeys(accessToken, memberId);
      if (!exchangePubKey) continue;
      wrappedKeys[memberId] = await wrapConversationKey(newKey, exchangePubKey);
    }
    await api.upsertConversationKeys(accessToken, conversationId, wrappedKeys);
    keyStore.setConversationKey(conversationId, newKey);
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, memberIds: remainingIds } : c,
      ),
    }));
  },

  patchConversation(updated) {
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === updated.id ? updated : c)),
    }));
  },

  async sendMessage(accessToken, conversationId, text) {
    const socket = getSocket(accessToken);
    const conv = get().conversations.find((c) => c.id === conversationId);
    const convKey = await ensureConversationKey(
      accessToken,
      conversationId,
      conv?.memberIds,
    );
    if (!convKey) throw new Error("No conversation key available.");
    const { ciphertext, nonce } = await encryptMessage(text, convKey);
    socket.emit("chat:send", { conversationId, ciphertext, nonce });
  },

  async receive(accessToken, message) {
    const activeId = get().activeId;
    const conv = get().conversations.find(
      (c) => c.id === message.conversationId,
    );
    const decrypted = await tryDecrypt(accessToken, message, conv?.memberIds);
    set((s) => {
      const prev = s.messagesByConv[message.conversationId] ?? [];
      if (prev.some((m) => m.id === decrypted.id)) return s;
      const isActive = activeId === decrypted.conversationId;
      return {
        messagesByConv: {
          ...s.messagesByConv,
          [decrypted.conversationId]: [...prev, decrypted],
        },
        unreadByConv: {
          ...s.unreadByConv,
          [decrypted.conversationId]: isActive
            ? 0
            : (s.unreadByConv[decrypted.conversationId] ?? 0) + 1,
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

  async deleteConversation(accessToken, id) {
    await api.deleteConversation(accessToken, id);
    get().removeConversation(id);
  },

  removeConversation(id) {
    set((s) => {
      const messagesByConv = { ...s.messagesByConv };
      const historyLoadedConvs = { ...s.historyLoadedConvs };
      const unreadByConv = { ...s.unreadByConv };
      const tempSessionByConv = { ...s.tempSessionByConv };
      delete messagesByConv[id];
      delete historyLoadedConvs[id];
      delete unreadByConv[id];
      delete tempSessionByConv[id];
      return {
        conversations: s.conversations.filter((c) => c.id !== id),
        activeId: s.activeId === id ? null : s.activeId,
        messagesByConv,
        historyLoadedConvs,
        unreadByConv,
        tempSessionByConv,
      };
    });
  },

  reset() {
    set({
      conversations: [],
      activeId: null,
      messagesByConv: {},
      historyLoadedConvs: {},
      loadingConvId: null,
      unreadByConv: {},
      tempSessionByConv: {},
    });
  },
}));
