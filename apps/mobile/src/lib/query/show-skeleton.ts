/** True only on the first load with no cached data — not on background refetch. */
export function showQuerySkeleton<TData>(query: {
  isPending: boolean;
  data: TData | undefined;
}): boolean {
  return query.isPending && query.data === undefined;
}
