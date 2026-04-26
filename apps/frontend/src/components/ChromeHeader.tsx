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
    label: "カベを追加",
    primary: true,
  },
];

export default function ChromeHeader() {
  const pathname = usePathname();
  const { showGlobalHeader } = getAppChromeSettings(pathname);

  if (!showGlobalHeader) {
    return null;
  }

  return (
    <AppHeader
      leading={
        <Link className="site-header__brand" href="/">
          Street Art App
        </Link>
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
