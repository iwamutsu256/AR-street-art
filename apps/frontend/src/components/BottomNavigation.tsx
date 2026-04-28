"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gear, MapPin, PlusCircle, type Icon } from "@phosphor-icons/react";
import { getAppChromeSettings } from "../lib/appChrome";

type BottomNavigationItem = {
  href: string;
  label: string;
  Icon: Icon;
  isActive: (pathname: string) => boolean;
};

const items: BottomNavigationItem[] = [
  {
    href: "/",
    label: "マップ",
    Icon: MapPin,
    isActive: (pathname) => pathname === "/",
  },
  {
    href: "/walls/new",
    label: "カベを追加",
    Icon: PlusCircle,
    isActive: (pathname) =>
      pathname === "/walls/new" || pathname.startsWith("/walls/new/"),
  },
  {
    href: "/settings",
    label: "設定",
    Icon: Gear,
    isActive: (pathname) =>
      pathname === "/settings" || pathname.startsWith("/settings/"),
  },
];

export default function BottomNavigation() {
  const pathname = usePathname();
  const { showBottomNavigation } = getAppChromeSettings(pathname);

  if (!showBottomNavigation) {
    return null;
  }

  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-80 hidden border-t border-[rgba(31,26,20,0.14)] bg-[rgba(255,253,248,0.92)] shadow-[0_-12px_32px_rgba(31,26,20,0.12)] backdrop-blur-[14px] max-[720px]:block"
      style={{
        minHeight: "var(--mobile-bottom-nav-height)",
        padding:
          "8px max(12px, env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))",
      }}
    >
      <div className="mx-auto grid w-full max-w-105 grid-cols-3 gap-1.5">
        {items.map(({ href, label, Icon, isActive }) => {
          const active = isActive(pathname);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className="grid min-h-14 min-w-0 place-items-center content-center gap-1 rounded-2xl text-center text-xs font-black text-fg-muted no-underline aria-[current=page]:bg-primary/12 aria-[current=page]:text-primary-active"
              href={href}
              key={href}
            >
              <Icon
                aria-hidden="true"
                size={24}
                weight={active ? "fill" : "regular"}
              />
              <span className="max-w-full leading-tight [overflow-wrap:anywhere]">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
