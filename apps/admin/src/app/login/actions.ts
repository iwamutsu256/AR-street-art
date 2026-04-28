'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
  const password = formData.get('password') as string;
  const adminPassword = process.env.ADMIN_PASSWORD ?? '';
  const sessionSecret = process.env.ADMIN_SESSION_SECRET ?? '';

  if (!adminPassword || !sessionSecret) {
    throw new Error('ADMIN_PASSWORD and ADMIN_SESSION_SECRET must be set');
  }

  if (password !== adminPassword) {
    redirect('/login?error=1');
  }

  const cookieStore = await cookies();
  cookieStore.set('admin_session', sessionSecret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  redirect('/');
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('admin_session');
  redirect('/login');
}
