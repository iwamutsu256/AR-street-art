'use client';

export default function ScanGuide() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 30,
    }}>
      <div style={{ position: 'relative', width: 288, height: 288 }}>
        {([
          { top: 0, left: 0, borderTop: '4px solid var(--color-fg-inverse)', borderLeft: '4px solid var(--color-fg-inverse)', borderRadius: '8px 0 0 0' },
          { top: 0, right: 0, borderTop: '4px solid var(--color-fg-inverse)', borderRight: '4px solid var(--color-fg-inverse)', borderRadius: '0 8px 0 0' },
          { bottom: 0, left: 0, borderBottom: '4px solid var(--color-fg-inverse)', borderLeft: '4px solid var(--color-fg-inverse)', borderRadius: '0 0 0 8px' },
          { bottom: 0, right: 0, borderBottom: '4px solid var(--color-fg-inverse)', borderRight: '4px solid var(--color-fg-inverse)', borderRadius: '0 0 8px 0' },
        ] as React.CSSProperties[]).map((style, i) => (
          <div key={i} style={{ position: 'absolute', width: 40, height: 40, ...style }} />
        ))}

        <div className="ar-scan-line" style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 2,
          background: 'rgba(22, 101, 52, 0.8)',
        }} />

        <div style={{
          position: 'absolute',
          bottom: -40,
          left: 0,
          right: 0,
          textAlign: 'center',
        }}>
          <span style={{
            color: 'var(--color-fg-inverse)',
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: '0.05em',
            textShadow: '0 1px 4px rgba(20, 17, 14, 0.8)',
          }}>
            壁をスキャン中...
          </span>
        </div>
      </div>
    </div>
  );
}
