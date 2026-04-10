"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { THEME_STORAGE_KEY } from "./theme-script";

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeState {
  preference: ThemePref;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePref) => void;
  _hydrate: () => void;
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readStored(): ThemePref {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

function applyToDOM(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
}

export const useTheme = create<ThemeState>((set) => ({
  preference: "system",
  resolved: "light",

  setPreference(pref) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {}
    const resolved = pref === "system" ? systemTheme() : pref;
    applyToDOM(resolved);
    set({ preference: pref, resolved });
  },

  _hydrate() {
    const pref = readStored();
    const resolved = pref === "system" ? systemTheme() : pref;
    applyToDOM(resolved);
    set({ preference: pref, resolved });
  },
}));

/**
 * Call once in the root client layout to sync theme from localStorage
 * and track OS preference changes when set to "system".
 */
export function useThemeSync() {
  const _hydrate = useTheme((s) => s._hydrate);
  const preference = useTheme((s) => s.preference);

  useEffect(() => {
    _hydrate();
  }, [_hydrate]);

  useEffect(() => {
    if (preference !== "system" || typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const resolved = media.matches ? "dark" : "light";
      applyToDOM(resolved);
      useTheme.setState({ resolved });
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);
}
