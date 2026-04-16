"use client";

import type { PrivateKeyBundle } from "./crypto";

/**
 * Singleton Pattern (client side).
 *
 * All React components share a single in-memory cache of:
 *   - the signed-in user's unwrapped private keys
 *   - per-conversation unwrapped symmetric keys
 *
 * Private keys are mirrored to `sessionStorage` so a page refresh does
 * not force a password re-prompt. They are wiped on logout and are not
 * readable from another tab (sessionStorage scope is the tab).
 */

const SESSION_KEY = "relay:priv";

class KeyStore {
  private privateBundle: PrivateKeyBundle | null = null;
  private readonly convKeys = new Map<string, string>();

  setPrivateBundle(bundle: PrivateKeyBundle): void {
    this.privateBundle = bundle;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(bundle));
    }
  }

  getPrivateBundle(): PrivateKeyBundle | null {
    if (this.privateBundle) return this.privateBundle;
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      this.privateBundle = JSON.parse(raw) as PrivateKeyBundle;
      return this.privateBundle;
    } catch {
      return null;
    }
  }

  setConversationKey(conversationId: string, convKey: string): void {
    this.convKeys.set(conversationId, convKey);
  }

  getConversationKey(conversationId: string): string | null {
    return this.convKeys.get(conversationId) ?? null;
  }

  clear(): void {
    this.privateBundle = null;
    this.convKeys.clear();
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(SESSION_KEY);
    }
  }
}

export const keyStore = new KeyStore();
