export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
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
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
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
};
