import { NextResponse, type NextRequest } from 'next/server';
import { authenticateRequest } from '@/server/auth/session-middleware';
import { buildSessionCookieHeader } from '@/server/auth/session-cookie-builder';
import { countUsers, getUser } from '@/server/db/users';

// Note: Next.js 16's proxy convention (the rename of middleware in 15→16)
// always runs on the Node.js runtime; the `export const runtime` directive
// that the old middleware accepted is forbidden in proxy files.

// Exclude public static assets from the auth gate. `_next` is build output;
// `covers` are the vendored sign-in cover images (served on the unauthenticated
// /login page); `img` holds public branding (OG preview, icons) that social
// crawlers and the browser fetch without a session. Without these exclusions
// the proxy 307-redirects every asset request to /login.
export const config = {
  matcher: ['/((?!_next|covers|img|favicon\\.ico).*)'],
};

// Anonymous mobile-onboarding endpoints. These must be reachable WITHOUT a
// session cookie or the mobile app can never connect or log in: handshake
// (server capabilities) and version are pure-anon, and exchange is public but
// self-gated by a one-time exchange code (it returns 401 on a bad code). The
// authenticated mobile endpoints (push/register, changelog-seen) are NOT here —
// they carry the mobile bearer token and pass authenticateRequest normally.
function isAnonMobilePath(path: string): boolean {
  return (
    path === '/api/mobile/handshake' ||
    path === '/api/mobile/version' ||
    path === '/api/mobile/exchange'
  );
}

function isPathExemptDuringFirstRun(path: string): boolean {
  if (path === '/first-run') return true;
  if (path.startsWith('/api/first-run/')) return true;
  if (path === '/api/health') return true;
  if (path.startsWith('/api/auth/')) return true;
  if (isAnonMobilePath(path)) return true;
  return false;
}

function isPathExemptWhenAuthEnabled(path: string): boolean {
  if (path === '/api/health') return true;
  if (path.startsWith('/api/first-run/')) return true;
  if (path.startsWith('/api/auth/')) return true;
  if (isAnonMobilePath(path)) return true;
  return false;
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname;

  // ---- First-run gate ----
  let usersExist = false;
  try {
    usersExist = (await countUsers()) > 0;
  } catch {
    // DB error (e.g. before migrations applied) — treat as no users.
  }

  if (!usersExist) {
    if (isPathExemptDuringFirstRun(path)) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = '/first-run';
    return NextResponse.redirect(url);
  }

  // ---- Auth-required mode (users exist) ----
  if (isPathExemptWhenAuthEnabled(path)) {
    return NextResponse.next();
  }

  const auth = await authenticateRequest(req);

  const sessionCookieHeader =
    auth.kind === 'authenticated' && auth.sessionTokenToSet !== undefined
      ? buildSessionCookieHeader(auth.sessionTokenToSet)
      : null;

  if (path.startsWith('/api/')) {
    if (auth.kind === 'unauthenticated') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const res = NextResponse.next();
    if (sessionCookieHeader !== null) {
      res.headers.append('set-cookie', sessionCookieHeader);
    }
    return res;
  }

  // Non-API: /login is always reachable.
  if (path === '/login') {
    const res = NextResponse.next();
    if (sessionCookieHeader !== null) {
      res.headers.append('set-cookie', sessionCookieHeader);
    }
    return res;
  }

  if (auth.kind === 'unauthenticated') {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    if (path !== '/') url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  // mustChangePassword redirect for non-system actors.
  if (auth.actor !== 'system' && path !== '/change-password') {
    const user = await getUser(auth.actor.userId);
    if (user?.mustChangePassword) {
      const url = req.nextUrl.clone();
      url.pathname = '/change-password';
      const res = NextResponse.redirect(url);
      if (sessionCookieHeader !== null) {
        res.headers.append('set-cookie', sessionCookieHeader);
      }
      return res;
    }
  }

  const res = NextResponse.next();
  if (sessionCookieHeader !== null) {
    res.headers.append('set-cookie', sessionCookieHeader);
  }
  return res;
}
