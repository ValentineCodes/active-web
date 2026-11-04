import { parseOverviewPayload, type OverviewPayload } from '@/lib/overview/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type OverviewFetchResult =
  { ok: true; data: OverviewPayload } | { ok: false; error: string };

export async function fetchOverview(
  periodStart: Date,
  periodEnd: Date,
): Promise<OverviewFetchResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_overview', {
    p_period_start: periodStart.toISOString(),
    p_period_end: periodEnd.toISOString(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const parsed = parseOverviewPayload(data);
  if (!parsed) {
    return { ok: false, error: 'Unexpected overview response shape' };
  }

  return { ok: true, data: parsed };
}
