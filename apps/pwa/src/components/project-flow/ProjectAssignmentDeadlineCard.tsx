'use client';

import { useEffect, useState } from 'react';
import { isPast } from 'date-fns';

import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { formatDeliveryRemaining } from '@/features/requests/delivery-duration';
import { formatDeliveryInstantLabel } from '@/features/requests/engagement-lifecycle';
import { formatWhenHome } from '@/lib/format';

export function ProjectAssignmentDeadlineCard({
  dueAt,
  status,
}: {
  dueAt: string | null;
  status: string;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!dueAt || status === 'completed' || status === 'cancelled') return;
    const handle = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(handle);
  }, [dueAt, status]);

  if (!dueAt) return null;

  const deadline = new Date(dueAt);
  const overdue = status === 'commenced' && isPast(deadline);
  const countdown = formatDeliveryRemaining(dueAt, now);
  const calendarLabel = formatDeliveryInstantLabel(dueAt, null);

  return (
    <RequestCallout
      tone={overdue ? 'danger' : status === 'completed' ? 'info' : 'warning'}
      title={overdue ? 'Past delivery deadline' : status === 'completed' ? 'Delivery deadline' : 'Delivery deadline'}
    >
      <div className="flex flex-col gap-1">
        {calendarLabel ? <p className="text-sm text-ink">{calendarLabel}</p> : null}
        {status === 'commenced' && countdown ? (
          <p className="text-sm font-semibold text-ink">
            {overdue ? `${countdown} overdue` : `${countdown} remaining`}
          </p>
        ) : status !== 'commenced' ? (
          <p className="text-sm text-muted">Due {formatWhenHome(dueAt)}</p>
        ) : null}
      </div>
    </RequestCallout>
  );
}