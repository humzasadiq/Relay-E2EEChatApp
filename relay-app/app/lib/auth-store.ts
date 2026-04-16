"use client";

import { create } from "zustand";
import { api, ApiError, PublicUser } from "./api";
import { generateKeyBundle, unwrapPrivateKeys } from "./crypto";
import { keyStore } from "./key-store";

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  status: "idle" | "loading" | "ready";
  error: string | null;
  /**
   * True once we've unwrapped the user's private keys and can encrypt
   * or decrypt. `false` with a user signed in means "password needed".
   */
  keysReady: boolean;

  signup: (input: {
    email: string;
    displayName: string;
    password: string;
  }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  updateProfile: (input: { displayName?: string }) => Promise<void>;
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
  keysReady: false,

  async signup(input) {
    set({ status: "loading", error: null });
    try {
      const res = await api.signup(input);
      // Generate identity + exchange keys, wrap private half with the
      // user's password, and upload. The server treats the wrapped blob
      // as opaque.
      const { publicBundle, privateBundle, wrappedPrivateKeys } =
        await generateKeyBundle(input.password);
      await api.saveMyKeyBundle(res.accessToken, {
        identityPubKey: publicBundle.identityPubKey,
        exchangePubKey: publicBundle.exchangePubKey,
        wrappedPrivateKeys,
      });
      keyStore.setPrivateBundle(privateBundle);
      set({
        user: res.user,
        accessToken: res.accessToken,
        status: "ready",
        keysReady: true,
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
      // Fetch wrapped private keys and unwrap with the password we
      // already have in hand. If no bundle exists (legacy account
      // created before M3), generate one now.
      let bundle = await api.getMyKeyBundle(res.accessToken);
      if (!bundle) {
        const { publicBundle, privateBundle, wrappedPrivateKeys } =
          await generateKeyBundle(input.password);
        bundle = await api.saveMyKeyBundle(res.accessToken, {
          identityPubKey: publicBundle.identityPubKey,
          exchangePubKey: publicBundle.exchangePubKey,
          wrappedPrivateKeys,
        });
        keyStore.setPrivateBundle(privateBundle);
      } else {
        const priv = await unwrapPrivateKeys(
          bundle.wrappedPrivateKeys,
          input.password,
        );
        keyStore.setPrivateBundle(priv);
      }
      set({
        user: res.user,
        accessToken: res.accessToken,
        status: "ready",
        keysReady: true,
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
    keyStore.clear();
    set({ user: null, accessToken: null, keysReady: false });
  },

  async hydrate() {
    if (get().status === "loading") return;
    set({ status: "loading" });
    try {
      const { accessToken } = await api.refresh();
      const user = await api.me(accessToken);
      // Refresh alone can't recover private keys — that needs the
      // password. If sessionStorage still has them from this tab, reuse
      // them; otherwise the user will need to re-enter their password
      // (handled by keysReady gating in the UI).
      const hasKeys = keyStore.getPrivateBundle() !== null;
      set({ user, accessToken, status: "ready", keysReady: hasKeys });
    } catch {
      set({ user: null, accessToken: null, status: "ready", keysReady: false });
    }
  },

  async updateProfile(input) {
    const token = get().accessToken;
    if (!token) return;
    const user = await api.updateProfile(token, input);
    set({ user });
  },
}));
