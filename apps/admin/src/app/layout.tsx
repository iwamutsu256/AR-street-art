import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin — Street Art AR',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f5f5f5', color: '#111' }}>
        {children}
      </body>
    </html>
  );
}
