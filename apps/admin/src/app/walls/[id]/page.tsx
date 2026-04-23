import { AdminNav } from '@/components/AdminNav';
import { fetchWall } from '@/lib/api';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function WallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wall = await fetchWall(id);

  if (!wall) notFound();

  return (
    <>
      <AdminNav />
      <main style={{ padding: '2rem', maxWidth: '960px', margin: '0 auto' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/walls" style={{ color: '#6b7280', fontSize: '0.875rem', textDecoration: 'none' }}>← ウォール一覧</Link>
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.25rem' }}>{wall.name}</h1>
        <p style={{ color: '#6b7280', margin: '0 0 2rem' }}>{wall.displayAddress ?? '住所未登録'}</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <Section title="基本情報">
            <FieldRow label="ID" value={<code style={{ fontSize: '0.75rem', background: '#f3f4f6', padding: '2px 6px', borderRadius: '3px' }}>{wall.id}</code>} />
            <FieldRow label="登録日" value={new Date(wall.createdAt).toLocaleString('ja-JP')} />
            <FieldRow label="緯度" value={wall.latitude.toString()} />
            <FieldRow label="経度" value={wall.longitude.toString()} />
            <FieldRow label="方位角" value={wall.approxHeading != null ? `${wall.approxHeading}°` : '—'} />
            <FieldRow label="可視半径" value={`${wall.visibilityRadiusM} m`} />
          </Section>

          {wall.canvas && (
            <Section title="キャンバス">
              <FieldRow label="ID" value={<code style={{ fontSize: '0.75rem', background: '#f3f4f6', padding: '2px 6px', borderRadius: '3px' }}>{wall.canvas.id}</code>} />
              <FieldRow label="サイズ" value={`${wall.canvas.width} × ${wall.canvas.height} px`} />
              <FieldRow label="パレット" value={wall.canvas.paletteVersion} />
            </Section>
          )}
        </div>

        {(wall.originalImageUrl || wall.thumbnailImageUrl || wall.rectifiedImageUrl) && (
          <div style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>画像</h2>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <ImageCard label="オリジナル" url={wall.originalImageUrl} />
              <ImageCard label="サムネイル" url={wall.thumbnailImageUrl} />
              <ImageCard label="補正済み" url={wall.rectifiedImageUrl} />
            </div>
          </div>
        )}

        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>コーナー座標</h2>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={thStyle}>点</th>
                  <th style={thStyle}>X</th>
                  <th style={thStyle}>Y</th>
                </tr>
              </thead>
              <tbody>
                {wall.cornerCoordinates.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={tdStyle}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{c.x}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{c.y}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.25rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem', color: '#374151' }}>{title}</h2>
      <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>{children}</dl>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.875rem' }}>
      <dt style={{ color: '#6b7280', minWidth: '90px', flexShrink: 0 }}>{label}</dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </div>
  );
}

function ImageCard({ label, url }: { label: string; url: string | null }) {
  if (!url) return null;
  return (
    <div>
      <p style={{ margin: '0 0 0.375rem', fontSize: '0.75rem', color: '#6b7280' }}>{label}</p>
      <img src={url} alt={label} style={{ width: '200px', height: '140px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e5e7eb', display: 'block' }} />
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '0.625rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' };
const tdStyle: React.CSSProperties = { padding: '0.625rem 1rem' };
