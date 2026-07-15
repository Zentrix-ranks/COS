// apps/web/server/auth.ts
// Supabase Auth wiring for the control plane. Source: spec/02 §8.1 (Supabase Auth; session +
// RLS-backed data access), spec/04 §12 (role-based access). Env-gated: with SUPABASE_URL +
// SUPABASE_ANON_KEY set, real sessions are read; without them the app runs open (dev).
import 'server-only';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function isAuthConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

function client() {
  const store = cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
        // In Server Components cookie writes throw; the middleware refreshes the session instead.
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          /* read-only context — ignore */
        }
      },
    },
  });
}

export interface AuthedUser {
  id: string;
  email: string | null;
  role: string;
}

/** Current signed-in user + app role (profiles.role), or null when unauthenticated/unconfigured. */
export async function getUser(): Promise<AuthedUser | null> {
  if (!isAuthConfigured()) return null;
  const supabase = client();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
  return { id: data.user.id, email: data.user.email ?? null, role: (profile?.role as string) ?? 'viewer' };
}

/**
 * The app role to assume for RLS (doc 04 §12) — set as `request.jwt.role`, which the policies
 * read via auth.role(). Unauthenticated requests get 'viewer' (read-only). When Supabase isn't
 * configured (dev) we assume 'owner' so a locally RLS-subject connection still has full access;
 * production always resolves the real signed-in role.
 */
export async function roleForRequest(): Promise<string> {
  if (!isAuthConfigured()) return 'owner';
  const user = await getUser();
  return user?.role ?? 'viewer';
}
