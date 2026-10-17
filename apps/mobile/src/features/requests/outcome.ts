/** Normalized request outcome text from public.requests.description (source of truth). */
export function requestOutcomeDescription(description: string | null | undefined): string {
  return description?.trim() ?? '';
}
