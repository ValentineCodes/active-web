export type EngagementCancellationReasonOption = {
  id: string;
  label: string;
};

export const ENGAGEMENT_CANCELLATION_SOMETHING_ELSE_ID = 'something_else';

export const ENGAGEMENT_CANCELLATION_REASONS: EngagementCancellationReasonOption[] = [
  { id: 'plans_changed', label: 'My plans changed' },
  { id: 'no_longer_needed', label: 'I no longer need help' },
  { id: 'schedule_conflict', label: "Schedule doesn't work" },
  { id: 'found_another', label: 'Found help elsewhere' },
  { id: 'unable_to_help', label: "I can't complete this job" },
  { id: ENGAGEMENT_CANCELLATION_SOMETHING_ELSE_ID, label: 'Something else' },
];

export function resolveEngagementCancellationReasonText(input: {
  selectedId: string | null;
  customText: string;
}): string | null {
  if (!input.selectedId) return null;

  if (input.selectedId === ENGAGEMENT_CANCELLATION_SOMETHING_ELSE_ID) {
    const trimmed = input.customText.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  const option = ENGAGEMENT_CANCELLATION_REASONS.find((row) => row.id === input.selectedId);
  return option?.label ?? null;
}
