"use client";

import Image from "next/image";
import { useTheme } from "../lib/theme-store";

interface Props {
  size?: number;
  className?: string;
}

/**
 * dark mode  → light.png (black-on-white logo, contrasts on dark bg)
 * light mode → dark.png  (white-on-black logo, contrasts on light bg)
 */
export function RelayLogo({ size = 48, className = "" }: Props) {
  const resolved = useTheme((s) => s.resolved);
  const src = resolved === "dark" ? "/logos/light.png" : "/logos/dark.png";
  return (
    <Image
      src={src}
      alt="Relay"
      width={size}
      height={size}
      className={`rounded-xl ${className}`}
      priority
    />
  );
}
