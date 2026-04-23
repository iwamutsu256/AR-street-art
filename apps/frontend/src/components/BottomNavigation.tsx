"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gear, MapPin, Wall, type Icon } from "@phosphor-icons/react";

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
    href: "/walls",
    label: "カベ",
    Icon: Wall,
    isActive: (pathname) =>
      pathname === "/walls" || pathname.startsWith("/walls/"),
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

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile">
      <div className="mobile-bottom-nav__inner">
        {items.map(({ href, label, Icon, isActive }) => {
          const active = isActive(pathname);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className="mobile-bottom-nav__link"
              href={href}
              key={href}
            >
              <Icon
                aria-hidden="true"
                size={24}
                weight={active ? "fill" : "regular"}
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
