const ENGAGEMENT_STATUSES = new Set(['accepted', 'in_progress', 'completion_pending']);

type MyRequestRow = {
  request_id: string;
  title: string | null;
  status: string;
  scheduled_for: string | null;
  accepted_at: string | null;
  updated_at: string | null;
};

type ResponseRow = {
  request_id: string;
  title: string | null;
  scheduled_for: string | null;
  response_status: string;
  request_status: string;
  created_at: string | null;
};

type Candidate = {
  id: string;
  title: string;
  status: string;
  scheduledFor: string | null;
  acceptedAt: string | null;
  updatedAt: string | null;
};

function engagementStatusRank(status: string): number {
  if (status === 'in_progress') return 0;
  if (status === 'completion_pending') return 1;
  if (status === 'accepted') return 2;
  return 3;
}

/** Mirrors `request_schedule_anchor` + `my_attendance` ordering (soonest first, nulls last). */
function scheduleAnchorMs(scheduledFor: string | null, acceptedAt: string | null): number {
  const anchor = scheduledFor ?? acceptedAt;
  if (!anchor) return Number.POSITIVE_INFINITY;
  return new Date(anchor).getTime();
}

export function pickHomeActiveRequest(
  requests: MyRequestRow[] | undefined,
  responses: ResponseRow[] | undefined,
): { id: string; title: string } | null {
  const requestById = new Map((requests ?? []).map((row) => [row.request_id, row]));
  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  for (const row of requests ?? []) {
    if (!ENGAGEMENT_STATUSES.has(row.status)) continue;
    seen.add(row.request_id);
    candidates.push({
      id: row.request_id,
      title: row.title ?? 'Request',
      status: row.status,
      scheduledFor: row.scheduled_for,
      acceptedAt: row.accepted_at,
      updatedAt: row.updated_at,
    });
  }

  for (const row of responses ?? []) {
    if (row.response_status !== 'accepted') continue;
    if (!ENGAGEMENT_STATUSES.has(row.request_status)) continue;
    if (seen.has(row.request_id)) continue;
    seen.add(row.request_id);
    const request = requestById.get(row.request_id);
    candidates.push({
      id: row.request_id,
      title: row.title ?? 'Request',
      status: row.request_status,
      scheduledFor: row.scheduled_for,
      acceptedAt: request?.accepted_at ?? null,
      updatedAt: request?.updated_at ?? row.created_at,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const byStatus = engagementStatusRank(a.status) - engagementStatusRank(b.status);
    if (byStatus !== 0) return byStatus;

    const bySchedule =
      scheduleAnchorMs(a.scheduledFor, a.acceptedAt) -
      scheduleAnchorMs(b.scheduledFor, b.acceptedAt);
    if (bySchedule !== 0) return bySchedule;

    return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
  });

  const top = candidates[0];
  if (!top) return null;
  return { id: top.id, title: top.title };
}
