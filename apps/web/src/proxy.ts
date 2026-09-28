import { NextResponse, type NextRequest } from 'next/server';
import { decideRedirect, SESSION_COOKIE } from '@/lib/routing';

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|icons/|manifest.webmanifest|sw.js).*)'],
};

export function proxy(req: NextRequest) {
  const redirect = decideRedirect({
    pathname: req.nextUrl.pathname,
    hasSession: req.cookies.has(SESSION_COOKIE),
  });
  if (redirect) return NextResponse.redirect(new URL(redirect.to, req.url));
  return NextResponse.next();
}
