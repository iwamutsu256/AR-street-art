import { AdminNav } from '@/components/AdminNav';
import { fetchWalls } from '@/lib/api';
import Link from 'next/link';

export default async function WallsPage() {
  const walls = await fetchWalls();

  return (
    <>
      <AdminNav />
      <main style={{ padding: '2rem', maxWidth: '960px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>
          ウォール一覧 <span style={{ fontSize: '1rem', fontWeight: 400, color: '#6b7280' }}>({walls.length}件)</span>
        </h1>

        {walls.length === 0 ? (
          <p style={{ color: '#6b7280' }}>ウォールがまだ登録されていません</p>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={thStyle}>サムネイル</th>
                  <th style={thStyle}>名前</th>
                  <th style={thStyle}>住所</th>
                  <th style={thStyle}>座標</th>
                  <th style={thStyle}>登録日</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {walls.map((wall) => (
                  <tr key={wall.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={tdStyle}>
                      {wall.photoUrl ? (
                        <img
                          src={wall.photoUrl}
                          alt={wall.name}
                          style={{ width: '64px', height: '48px', objectFit: 'cover', borderRadius: '4px', display: 'block' }}
                        />
                      ) : (
                        <div style={{ width: '64px', height: '48px', background: '#f3f4f6', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.75rem' }}>
                          なし
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>{wall.name}</td>
                    <td style={{ ...tdStyle, color: '#6b7280' }}>{wall.displayAddress ?? '—'}</td>
                    <td style={{ ...tdStyle, color: '#6b7280', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {wall.latitude.toFixed(5)}, {wall.longitude.toFixed(5)}
                    </td>
                    <td style={{ ...tdStyle, color: '#6b7280' }}>{new Date(wall.createdAt).toLocaleDateString('ja-JP')}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <Link href={`/walls/${wall.id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>詳細</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}

const thStyle: React.CSSProperties = { padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' };
const tdStyle: React.CSSProperties = { padding: '0.75rem 1rem', verticalAlign: 'middle' };
