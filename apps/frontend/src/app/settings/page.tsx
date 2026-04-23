import type { Metadata } from 'next';
import { CaretRight } from '@phosphor-icons/react/dist/ssr';

export const metadata: Metadata = {
  title: '設定 | Street Art App',
  description: 'Street Art App の設定',
};

const settingsLinks = ['利用規約', 'プライバシーポリシー', 'サードパーティライセンス'];

export default function SettingsPage() {
  return (
    <main className="page-shell page-shell--settings">
      <section className="settings-page" aria-labelledby="settings-title">
        <div className="stack-sm">
          <div className="page-kicker">Settings</div>
          <h1 className="section-title" id="settings-title">
            設定
          </h1>
        </div>

        <div className="settings-link-list">
          {settingsLinks.map((label) => (
            <a className="settings-link-row" href="#" key={label}>
              <span>{label}</span>
              <CaretRight aria-hidden="true" size={20} weight="bold" />
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
