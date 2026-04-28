'use client';

export default function ScanGuide() {
  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
      <div className="relative h-72 w-72">
        {([
          { top: 0, left: 0, borderTop: '4px solid var(--color-fg-inverse)', borderLeft: '4px solid var(--color-fg-inverse)', borderRadius: '8px 0 0 0' },
          { top: 0, right: 0, borderTop: '4px solid var(--color-fg-inverse)', borderRight: '4px solid var(--color-fg-inverse)', borderRadius: '0 8px 0 0' },
          { bottom: 0, left: 0, borderBottom: '4px solid var(--color-fg-inverse)', borderLeft: '4px solid var(--color-fg-inverse)', borderRadius: '0 0 0 8px' },
          { bottom: 0, right: 0, borderBottom: '4px solid var(--color-fg-inverse)', borderRight: '4px solid var(--color-fg-inverse)', borderRadius: '0 0 8px 0' },
        ] as React.CSSProperties[]).map((style, i) => (
          <div
            key={i}
            className="absolute h-10 w-10"
            style={style}
          />
        ))}

        <div className="animate-ar-scan-line absolute inset-x-0 h-0.5 bg-success/80" />

        <div className="absolute inset-x-0 -bottom-10 text-center">
          <span
            className="text-sm font-medium tracking-[0.05em] text-fg-inverse"
            style={{ textShadow: "0 1px 4px rgba(20, 17, 14, 0.8)" }}
          >
            壁をスキャン中...
          </span>
        </div>
      </div>
    </div>
  );
}
