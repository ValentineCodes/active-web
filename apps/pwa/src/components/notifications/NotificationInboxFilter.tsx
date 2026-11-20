'use client';

import { AnimatedSegmentedControl } from '@/components/ui/AnimatedSegmentedControl';

export type InboxFilter = 'all' | 'unread';

const OPTIONS = [
  { value: 'all' as const, label: 'all' },
  { value: 'unread' as const, label: 'unread' },
];

export function NotificationInboxFilter({
  value,
  onChange,
}: {
  value: InboxFilter;
  onChange: (next: InboxFilter) => void;
}) {
  return (
    <div role="group" aria-label="Filter notifications">
      <AnimatedSegmentedControl value={value} options={OPTIONS} onChange={onChange} />
    </div>
  );
}