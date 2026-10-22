import { NextResponse } from 'next/server';

import { env } from '@/lib/env';
import { parseAdminPermissions } from '@/lib/admin/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type Body = {
  reason?: string;
  idempotencyKey?: string;
};

type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  const { id: userId } = await params;
  const body = (await request.json()) as Body;
  const reason = body.reason?.trim() ?? '';
  const idempotencyKey = body.idempotencyKey?.trim() ?? '';

  if (reason.length < 10) {
    return NextResponse.json({ error: 'A reason of at least 10 characters is required' }, { status: 400 });
  }
  if (!idempotencyKey) {
    return NextResponse.json({ error: 'idempotencyKey is required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: permissionsRaw, error: permissionsError } = await supabase.rpc(
    'get_my_admin_permissions',
  );
  if (permissionsError) {
    return NextResponse.json({ error: permissionsError.message }, { status: 403 });
  }
  const permissions = parseAdminPermissions(permissionsRaw);
  if (!permissions?.user_nin_reveal) {
    return NextResponse.json({ error: 'Not authorized to reveal NIN' }, { status: 403 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const response = await fetch(`${env.supabaseUrl}/functions/v1/admin-identity-nin-reveal`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId, reason, idempotencyKey }),
  });

  const payload = (await response.json()) as {
    status?: string;
    nin?: string;
    error?: string;
    code?: string;
  };

  if (!response.ok) {
    const status =
      payload.code === 'not_authorized' ? 403 : payload.code === 'not_found' ? 404 : response.status;
    return NextResponse.json({ error: payload.error ?? 'Could not reveal NIN' }, { status });
  }

  if (payload.status !== 'ok' || typeof payload.nin !== 'string') {
    return NextResponse.json({ error: 'Unexpected response' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: { nin: payload.nin } });
}
