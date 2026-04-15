'use client';

export function MapPlaceholder() {
  return (
    <div
      style={{
        height: 320,
        borderRadius: 16,
        border: '1px solid #d1d5db',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(135deg, #f3f4f6, #e5e7eb)',
        color: '#374151',
      }}
    >
      <div style={{ textAlign: 'center', padding: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Map Placeholder</div>
        <div>MapLibre + MapTiler の初期化は次段階でここに入れます。</div>
      </div>
    </div>
  );
}
