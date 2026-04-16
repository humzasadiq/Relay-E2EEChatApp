export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  /** Only present in search results. Needed to wrap conv keys for this user. */
  exchangePubKey?: string | null;
}

export interface StoredKeyBundle {
  userId: string;
  identityPubKey: string;
  exchangePubKey: string;
  wrappedPrivateKeys: string;
}

export interface PublicKeyBundleResponse {
  userId: string;
  identityPubKey: string;
  exchangePubKey: string;
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

export interface Conversation {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  memberIds: string[];
  /** displayName keyed by userId — populated by the backend */
  memberNames: Record<string, string>;
  /** email keyed by userId — stable avatar seed */
  memberEmails: Record<string, string>;
  /** ISO timestamp if a temporary-chat session is active, null otherwise */
  tempSessionSince: string | null;
  temporary: boolean;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  ciphertext: string;
  nonce: string;
  createdAt: string;
  /** Populated client-side after decrypt. Never sent from the server. */
  text?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const { accessToken, ...rest } = init;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((rest.headers as Record<string, string>) ?? {}),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...rest,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      (body as { message?: string }).message ?? res.statusText,
    );
  }
  // 204 always, and some Nest endpoints return 200 with an empty body
  // when the handler resolves to null/undefined — treat both as empty.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  signup: (body: { email: string; displayName: string; password: string }) =>
    request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  refresh: () =>
    request<{ accessToken: string }>("/auth/refresh", { method: "POST" }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: (accessToken: string) =>
    request<PublicUser>("/auth/me", { accessToken }),

  searchUsers: (accessToken: string, email: string) =>
    request<PublicUser[]>(
      `/users/search?email=${encodeURIComponent(email)}`,
      { accessToken },
    ),

  updateProfile: (accessToken: string, body: { displayName?: string }) =>
    request<PublicUser>("/users/me", {
      method: "PATCH",
      accessToken,
      body: JSON.stringify(body),
    }),

  listConversations: (accessToken: string) =>
    request<Conversation[]>("/chat/conversations", { accessToken }),

  createConversation: (
    accessToken: string,
    body: {
      type: "DIRECT" | "GROUP";
      memberIds: string[];
      name?: string;
      temporary?: boolean;
      wrappedKeys?: Record<string, string>;
    },
  ) =>
    request<Conversation>("/chat/conversations", {
      method: "POST",
      accessToken,
      body: JSON.stringify(body),
    }),

  getHistory: (accessToken: string, conversationId: string) =>
    request<ChatMessage[]>(
      `/chat/conversations/${conversationId}/messages`,
      { accessToken },
    ),

  getMyWrappedKey: (accessToken: string, conversationId: string) =>
    request<{ wrappedKey: string | null }>(
      `/chat/conversations/${conversationId}/key`,
      { accessToken },
    ),

  upsertConversationKeys: (
    accessToken: string,
    conversationId: string,
    wrappedKeys: Record<string, string>,
  ) =>
    request<{ ok: true }>(`/chat/conversations/${conversationId}/keys`, {
      method: "POST",
      accessToken,
      body: JSON.stringify({ wrappedKeys }),
    }),

  saveMyKeyBundle: (
    accessToken: string,
    body: {
      identityPubKey: string;
      exchangePubKey: string;
      wrappedPrivateKeys: string;
    },
  ) =>
    request<StoredKeyBundle>("/users/me/keys", {
      method: "PUT",
      accessToken,
      body: JSON.stringify(body),
    }),

  getMyKeyBundle: (accessToken: string) =>
    request<StoredKeyBundle | null>("/users/me/keys", { accessToken }),

  getUserKeys: (accessToken: string, userId: string) =>
    request<PublicKeyBundleResponse>(`/users/${userId}/keys`, { accessToken }),
};
