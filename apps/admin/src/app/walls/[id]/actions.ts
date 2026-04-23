'use server';

import { redirect } from 'next/navigation';

const API_URL = (process.env.INTERNAL_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export async function deleteWall(id: string) {
  const res = await fetch(`${API_URL}/walls/${id}`, { method: 'DELETE' });

  if (!res.ok) throw new Error('Failed to delete wall');

  redirect('/walls');
}
