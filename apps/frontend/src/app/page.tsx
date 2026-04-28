import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "../components/Spinner";
import { WallMap } from "../components/walls/WallMap";

export const metadata: Metadata = {
  title: "壁マップ | Street Art App",
  description: "Street Art App の壁マップ",
};

export default function MapPage() {
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

  return (
    <main className="page-shell h-[calc(100dvh-var(--header-height))] overflow-hidden max-[720px]:h-[calc(100dvh-var(--header-height)-var(--mobile-bottom-nav-space))]">
      <Suspense
        fallback={
          <div className="grid h-full place-items-center border border-border bg-bg-muted p-6">
            <div className="rounded-[22px] border border-border bg-bg-elevated px-6 py-5 text-fg shadow-[var(--shadow-panel)]">
              <Spinner label="地図を準備中..." size="lg" />
            </div>
          </div>
        }
      >
        <WallMap mapTilerKey={mapTilerKey} />
      </Suspense>
    </main>
  );
}
