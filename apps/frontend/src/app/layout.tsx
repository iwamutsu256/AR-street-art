import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Street Art App",
  description: "Online street art canvas prototype",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
