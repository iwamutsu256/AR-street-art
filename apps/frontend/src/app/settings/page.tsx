import type { Metadata } from "next";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "設定 | ARsT",
  description: "ARsT の設定",
};

const settingsLinks = [
  "利用規約",
  "プライバシーポリシー",
  "サードパーティライセンス",
];

export default function SettingsPage() {
  return (
    <main className="page-shell grid min-h-[calc(100dvh-var(--header-height))] content-start justify-items-center max-[720px]:min-h-[calc(100dvh-var(--header-height)-var(--mobile-bottom-nav-space))] max-[720px]:pt-[18px]">
      <section
        aria-labelledby="settings-title"
        className="grid w-full max-w-[560px] gap-6 rounded-3xl border border-border bg-bg-elevated p-6 shadow-[var(--shadow-elevated)] max-[720px]:gap-5 max-[720px]:rounded-[20px] max-[720px]:p-5"
      >
        <div className="stack-sm">
          <div className="page-kicker">Settings</div>
          <h1 className="section-title" id="settings-title">
            設定
          </h1>
        </div>

        <div className="grid gap-2 max-[720px]:gap-[7px]">
          {settingsLinks.map((label) => (
            <a
              className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-bg-elevated px-4 font-extrabold no-underline transition hover:-translate-y-px hover:border-border-strong hover:bg-bg-muted focus-visible:-translate-y-px focus-visible:border-border-strong focus-visible:bg-bg-muted max-[720px]:min-h-[52px] max-[720px]:rounded-[14px] max-[720px]:px-3.5"
              href="#"
              key={label}
            >
              <span>{label}</span>
              <CaretRight
                aria-hidden="true"
                className="text-fg-muted"
                size={20}
                weight="bold"
              />
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
