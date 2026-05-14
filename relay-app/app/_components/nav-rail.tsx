"use client";

import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useChat } from "../lib/chat-store";
import { useTheme } from "../lib/theme-store";

type Section = "chats" | "calls" | "learn";

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
  const router = useRouter();
  const pathname = usePathname();
  const unread = totalUnread(unreadByConv);

  // dark mode → light.png (black-on-white logo as contrast on dark rail)
  // light mode → dark.png (white-on-black logo as contrast on light rail)
  const logoSrc = resolved === "dark" ? "/logos/light.png" : "/logos/dark.png";

  const isLearn = pathname.startsWith("/app/learn");

  const items: {
    id: Section;
    label: string;
    badge?: number;
    route?: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: "chats",
      label: "Chats",
      badge: unread > 0 ? unread : undefined,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      id: "learn",
      label: "E2EE",
      route: "/app/learn",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
    },
  ];

  return (
    <nav
      className="hidden md:flex w-[68px] shrink-0 h-full flex-col items-center pt-3 pb-4 gap-1 border-r"
      style={{
        background: "var(--nav-bg)",
        borderColor: "var(--nav-border)",
      }}
    >
      {/* Logo — click navigates to the E2EE learn page */}
      <button
        onClick={() => router.push("/app/learn")}
        className="w-10 h-10 rounded-xl overflow-hidden mb-3 shrink-0 transition-opacity hover:opacity-80"
        title="How Relay encrypts"
      >
        <Image
          src={logoSrc}
          alt="Relay"
          width={40}
          height={40}
          className="w-full h-full object-cover"
          priority
        />
      </button>

      {items.map((item) => {
        const isActive = item.route ? isLearn : item.id === active && !isLearn;
        return (
          <button
            key={item.id}
            onClick={() => {
              if (item.route) { router.push(item.route); }
              else if (item.id === "chats") { router.push("/app"); onSelect(item.id); }
              else { onSelect(item.id); }
            }}
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
