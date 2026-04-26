import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/login')) return NextResponse.next();

  const session = request.cookies.get('admin_session');
  const secret = process.env.ADMIN_SESSION_SECRET ?? '';

  if (!secret || !session || session.value !== secret) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
