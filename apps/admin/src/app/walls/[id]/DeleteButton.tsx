'use client';

import { deleteWall } from './actions';

export function DeleteButton({ id, name }: { id: string; name: string }) {
  async function handleDelete() {
    if (!confirm(`「${name}」を削除しますか？\nキャンバスも一緒に削除されます。`)) return;
    await deleteWall(id);
  }

  return (
    <button
      onClick={handleDelete}
      style={{
        background: '#dc2626',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        padding: '0.5rem 1rem',
        fontSize: '0.875rem',
        cursor: 'pointer',
      }}
    >
      このウォールを削除
    </button>
  );
}
