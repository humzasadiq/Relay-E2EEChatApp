"use client";

import { create } from "zustand";
import { api, ApiError, PublicUser } from "./api";

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  status: "idle" | "loading" | "ready";
  error: string | null;

  signup: (input: {
    email: string;
    displayName: string;
    password: string;
  }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

/**
 * Singleton-like client-side auth store. Access tokens live in memory
 * only; the refresh cookie is httpOnly and handled by the browser.
 */
export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  status: "idle",
  error: null,

  async signup(input) {
    set({ status: "loading", error: null });
    try {
      const res = await api.signup(input);
      set({
        user: res.user,
        accessToken: res.accessToken,
        status: "ready",
      });
    } catch (e) {
      set({
        status: "ready",
        error: e instanceof ApiError ? e.message : "Signup failed",
      });
      throw e;
    }
  },

  async login(input) {
    set({ status: "loading", error: null });
    try {
      const res = await api.login(input);
      set({
        user: res.user,
        accessToken: res.accessToken,
        status: "ready",
      });
    } catch (e) {
      set({
        status: "ready",
        error: e instanceof ApiError ? e.message : "Login failed",
      });
      throw e;
    }
  },

  async logout() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    set({ user: null, accessToken: null });
  },

  async hydrate() {
    if (get().status === "loading") return;
    set({ status: "loading" });
    try {
      const { accessToken } = await api.refresh();
      const user = await api.me(accessToken);
      set({ user, accessToken, status: "ready" });
    } catch {
      set({ user: null, accessToken: null, status: "ready" });
    }
  },
}));
