// apps/web/middleware.ts
// Refreshes the Supabase auth session on each request so Server Components see a valid session
// (Supabase SSR pattern). Source: spec/02 §8.1. No-op when Supabase isn't configured (dev).
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  // Touch the session so refresh tokens rotate and cookies stay valid.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Run on app routes, excluding static assets and the SSE stream (long-lived).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/stream).*)'],
};
