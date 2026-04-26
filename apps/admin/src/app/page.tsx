import { AdminNav } from '@/components/AdminNav';
import { fetchWalls } from '@/lib/api';
import Link from 'next/link';

export default async function DashboardPage() {
  const walls = await fetchWalls();

  return (
    <>
      <AdminNav />
      <main style={{ padding: '2rem', maxWidth: '960px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>ダッシュボード</h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <StatCard label="ウォール数" value={walls.length} />
        </div>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>最近登録されたウォール</h2>
            <Link href="/walls" style={{ fontSize: '0.875rem', color: '#2563eb' }}>すべて見る →</Link>
          </div>
          <WallTable walls={walls.slice(-5).reverse()} />
        </section>
      </main>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.25rem' }}>
      <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '2rem', fontWeight: 700 }}>{value}</p>
    </div>
  );
}

function WallTable({ walls }: { walls: Awaited<ReturnType<typeof fetchWalls>> }) {
  if (walls.length === 0) {
    return <p style={{ color: '#6b7280' }}>ウォールがまだ登録されていません</p>;
  }
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <th style={thStyle}>名前</th>
            <th style={thStyle}>住所</th>
            <th style={thStyle}>登録日</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {walls.map((wall) => (
            <tr key={wall.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={tdStyle}>{wall.name}</td>
              <td style={{ ...tdStyle, color: '#6b7280' }}>{wall.displayAddress ?? '—'}</td>
              <td style={{ ...tdStyle, color: '#6b7280' }}>{new Date(wall.createdAt).toLocaleDateString('ja-JP')}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                <Link href={`/walls/${wall.id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>詳細</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' };
const tdStyle: React.CSSProperties = { padding: '0.75rem 1rem' };
