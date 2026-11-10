const RECENTS_KEY = 'active:request-search-recents';
const MAX_RECENTS = 8;

export type SearchRecent = { query: string; usedAt: number };

export async function loadSearchRecents(): Promise<SearchRecent[]> {
  try {
    const raw = sessionStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SearchRecent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function rememberSearchQuery(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return;
  const existing = await loadSearchRecents();
  const next = [
    { query: trimmed, usedAt: Date.now() },
    ...existing.filter((item) => item.query.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, MAX_RECENTS);
  sessionStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

export async function clearSearchRecents() {
  sessionStorage.removeItem(RECENTS_KEY);
}
