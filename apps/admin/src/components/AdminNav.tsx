import Link from 'next/link';
import { logout } from '@/app/login/actions';

export function AdminNav() {
  return (
    <nav style={{ background: '#111', color: '#fff', padding: '0 1.5rem', display: 'flex', alignItems: 'center', height: '56px', gap: '1.5rem' }}>
      <span style={{ fontWeight: 600, fontSize: '1rem', marginRight: 'auto' }}>
        Street Art Admin
      </span>
      <Link href="/" style={{ color: '#d1d5db', textDecoration: 'none', fontSize: '0.875rem' }}>
        ダッシュボード
      </Link>
      <Link href="/walls" style={{ color: '#d1d5db', textDecoration: 'none', fontSize: '0.875rem' }}>
        ウォール一覧
      </Link>
      <form action={logout} style={{ margin: 0 }}>
        <button
          type="submit"
          style={{ background: 'none', border: '1px solid #4b5563', color: '#d1d5db', borderRadius: '4px', padding: '0.25rem 0.75rem', fontSize: '0.875rem', cursor: 'pointer' }}
        >
          ログアウト
        </button>
      </form>
    </nav>
  );
}
