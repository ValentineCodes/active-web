export type SearchPersonRow = {
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_path: string | null;
  rating_average: number | null;
  rating_count: number | null;
  identity_verified: boolean;
};

export type SearchRequestRow = {
  request_id: string;
  title: string;
  description: string | null;
  location_label: string | null;
  distance_m: number | null;
  offered_amount: number | null;
  currency: string | null;
  requester_id: string;
  requester_display_name: string | null;
};

export type SearchProjectRow = {
  project_id: string;
  title: string;
  description: string | null;
  funding_status: string;
  funding_visibility: string;
  budget_total_kobo: number | null;
  min_funding_target_kobo: number | null;
  funding_deadline_at: string | null;
};

export type DiscoverPayload = {
  requests?: unknown[];
  people?: SearchPersonRow[];
  projects?: unknown[];
  ranking?: string;
};

export type SearchDiscoverListRow =
  | { kind: 'section'; key: string; title: string }
  | { kind: 'person'; key: string; person: SearchPersonRow; href: string }
  | { kind: 'request'; key: string; request: SearchRequestRow }
  | { kind: 'project'; key: string; project: SearchProjectRow; href: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function parseSearchPeopleRows(rows: unknown[] | undefined): SearchPersonRow[] {
  if (!rows?.length) return [];
  return rows.filter((row): row is SearchPersonRow => {
    if (!isRecord(row)) return false;
    return typeof row.user_id === 'string' && typeof row.username === 'string';
  });
}

export function parseSearchRequestRows(rows: unknown[] | undefined): SearchRequestRow[] {
  if (!rows?.length) return [];
  return rows.filter((row): row is SearchRequestRow => {
    if (!isRecord(row)) return false;
    return typeof row.request_id === 'string' && typeof row.title === 'string';
  });
}

export function parseSearchProjectRows(rows: unknown[] | undefined): SearchProjectRow[] {
  if (!rows?.length) return [];
  return rows.filter((row): row is SearchProjectRow => {
    if (!isRecord(row)) return false;
    return typeof row.project_id === 'string' && typeof row.title === 'string';
  });
}

export function parseDiscoverPayload(raw: DiscoverPayload): DiscoverPayload {
  return {
    ...raw,
    people: parseSearchPeopleRows(raw.people as unknown[] | undefined),
    requests: parseSearchRequestRows(raw.requests as unknown[] | undefined),
    projects: parseSearchProjectRows(raw.projects as unknown[] | undefined),
  };
}