import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function AccessDeniedPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="max-w-md rounded-2xl border border-border bg-elevated p-8 text-center shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Access denied</p>
        <h1 className="mt-2 text-xl font-semibold text-ink">No administrator permissions</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {user
            ? 'Your account is signed in but is not authorized for the operations dashboard. Contact a Super Admin if you need access.'
            : 'Sign in with an authorized staff account to continue.'}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {user ? (
            <form action="/api/auth/sign-out" method="post">
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>
          ) : (
            <Link href="/login">
              <Button>Go to sign in</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
