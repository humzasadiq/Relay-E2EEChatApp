"use client";

import BoringAvatar from "boring-avatars";

/**
 * Palette passed to boring-avatars beam variant.
 * Colors are picked from our brand palette + complementary hues so the
 * generated faces stay on-theme while still feeling distinct per user.
 */
const PALETTE = [
  "#2e6ee5",
  "#7c3aed",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#2760d3",
];

interface Props {
  /** Use email for the user's own avatar, displayName otherwise (fallback). */
  name: string;
  size?: number;
  className?: string;
  square?: boolean;
}

export function Avatar({ name, size = 40, className = "", square = false }: Props) {
  return (
    <div
      className={`shrink-0 overflow-hidden ${square ? "rounded-lg" : "rounded-full"} ${className}`}
      style={{ width: size, height: size }}
    >
      <BoringAvatar
        size={size}
        name={name || "?"}
        variant="beam"
        colors={PALETTE}
        square={square}
      />
    </div>
  );
}
