"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppHeader } from "./AppHeader";
import { getAppChromeSettings } from "../lib/appChrome";

const navItems = [
  {
    href: "/",
    label: "マップ",
  },
  {
    href: "/settings",
    label: "設定",
  },
  {
    href: "/walls/new",
    label: "壁を追加",
    primary: true,
  },
];

function getChromeTitle(pathname: string) {
  if (pathname === "/") {
    return "マップ";
  }

  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "設定";
  }

  if (pathname === "/walls/new" || pathname.startsWith("/walls/new/")) {
    return "壁を追加";
  }

  return "ARsT";
}

export default function ChromeHeader() {
  const pathname = usePathname();
  const { showGlobalHeader } = getAppChromeSettings(pathname);

  if (!showGlobalHeader) {
    return null;
  }

  return (
    <AppHeader
      title={
        <div className="site-header__title text-xl">
          {getChromeTitle(pathname)}
        </div>
      }
      trailing={
        <nav className="site-header__nav" aria-label="Global">
          {navItems.map(({ href, label, primary }) => (
            <Link
              className={`site-header__link${primary ? " site-header__link--primary" : ""}`}
              href={href}
              key={href}
            >
              {label}
            </Link>
          ))}
        </nav>
      }
    />
  );
}
