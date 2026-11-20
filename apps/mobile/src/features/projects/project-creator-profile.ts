function asFiniteNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

type ProjectCreatorProfileSource = {
  creator_rating_average: number | string | null;
  creator_rating_count: number | string | null;
  creator_completion_percent?: number | string | null;
  creator_identity_verified?: boolean | null;
};

export function projectCreatorProfileFields(detail: ProjectCreatorProfileSource) {
  const completionPercent = asFiniteNumber(detail.creator_completion_percent);
  return {
    ratingAverage: asFiniteNumber(detail.creator_rating_average),
    ratingCount: asFiniteNumber(detail.creator_rating_count) ?? 0,
    completionPercent: completionPercent != null ? Math.trunc(completionPercent) : null,
    identityVerified: detail.creator_identity_verified ?? false,
  };
}