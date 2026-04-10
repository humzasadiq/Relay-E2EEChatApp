"use client";

import Image from "next/image";
import { useChat } from "../lib/chat-store";
import { useTheme } from "../lib/theme-store";

type Section = "chats" | "calls";

interface Props {
  active: Section;
  onSelect: (s: Section) => void;
}

function totalUnread(unreadByConv: Record<string, number>) {
  return Object.values(unreadByConv).reduce((s, n) => s + n, 0);
}

export function NavRail({ active, onSelect }: Props) {
  const { unreadByConv } = useChat();
  const { resolved } = useTheme();
  const unread = totalUnread(unreadByConv);

  // dark mode → light.png (black-on-white logo as contrast on dark rail)
  // light mode → dark.png (white-on-black logo as contrast on light rail)
  const logoSrc = resolved === "dark" ? "/logos/light.png" : "/logos/dark.png";

  const items: {
    id: Section;
    label: string;
    badge?: number;
    icon: React.ReactNode;
  }[] = [
    {
      id: "chats",
      label: "Chats",
      badge: unread > 0 ? unread : undefined,
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      id: "calls",
      label: "Calls",
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.75h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      ),
    },
  ];

  return (
    <nav
      className="w-[68px] shrink-0 h-full flex flex-col items-center pt-3 pb-4 gap-1 border-r"
      style={{
        background: "var(--nav-bg)",
        borderColor: "var(--nav-border)",
      }}
    >
      {/* Logo mark — inverted per theme for contrast */}
      <div className="w-10 h-10 rounded-xl overflow-hidden mb-3 shrink-0">
        <Image
          src={logoSrc}
          alt="Relay"
          width={40}
          height={40}
          className="w-full h-full object-cover"
          priority
        />
      </div>

      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            title={item.label}
            className="relative w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors"
            style={{
              color: isActive
                ? "var(--nav-icon-active)"
                : "var(--nav-icon)",
              background: isActive
                ? "var(--nav-icon-active-bg)"
                : "transparent",
            }}
          >
            {item.icon}
            <span className="text-[9px] leading-none tracking-wide font-medium">
              {item.label}
            </span>
            {item.badge !== undefined && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] rounded-full bg-badge text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
