import type { Metadata } from "next";
import { JetBrains_Mono, Noto_Sans_JP } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import BottomNavigation from "../components/BottomNavigation";
import ChromeHeader from "../components/ChromeHeader";
import NearbyWallBanner from "../components/NearbyWallBanner";

const fontSans = Noto_Sans_JP({
  variable: "--font-sans",
  weight: "variable",
  subsets: ["latin"],
  display: "swap",
  fallback: [
    "Hiragino Sans",
    "Hiragino Kaku Gothic ProN",
    "Yu Gothic UI",
    "Yu Gothic",
    "Meiryo",
    "system-ui",
    "sans-serif",
  ],
});

const fontMono = JetBrains_Mono({
  variable: "--font-mono",
  weight: "variable",
  subsets: ["latin"],
  display: "swap",
  fallback: [
    "SFMono-Regular",
    "Cascadia Code",
    "Menlo",
    "Consolas",
    "BIZ UDGothic",
    "MS Gothic",
    "monospace",
  ],
});

export const metadata: Metadata = {
  title: "ARsT",
  description: "Online street art canvas prototype",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className={`${fontSans.variable} ${fontMono.variable}`}>
        <ChromeHeader />
        {children}

        <NearbyWallBanner />
        <BottomNavigation />
      </body>
    </html>
  );
}
