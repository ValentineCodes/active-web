'use client';

import { useEffect, useState } from 'react';
import { isPast } from 'date-fns';

import { RequestCallout } from '@/components/request-flow/RequestCallout';
import {
  formatDeliveryInDuration,
  formatDeliveryRemaining,
  type DeliveryDurationUnit,
} from '@/features/requests/delivery-duration';
import { formatDeliveryInstantLabel } from '@/features/requests/engagement-lifecycle';
import { formatWhenHome } from '@/lib/format';

function proposedDeliveryExplainer(viewerIsWorker: boolean): string {
  if (viewerIsWorker) {
    return 'This is how much time you asked for after you commence work. The countdown does not begin when you respond or when you are assigned — only after you press Commence work.';
  }
  return 'They proposed this delivery duration when responding. The binding calendar deadline appears only after they commence work.';
}

function bindingDeadlineExplainer(): string {
  return 'Set on the server when work commenced: start time plus the proposed duration.';
}

export function ProjectAssignmentDeadlineCard({
  dueAt,
  status,
  commencedAt,
  proposedDeliveryDurationValue,
  proposedDeliveryDurationUnit,
  viewerIsWorker = false,
}: {
  dueAt: string | null;
  status: string;
  commencedAt?: string | null;
  proposedDeliveryDurationValue?: number | null;
  proposedDeliveryDurationUnit?: DeliveryDurationUnit | null;
  viewerIsWorker?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());

  const hasBindingDeadline =
    status === 'commenced' || (status === 'completed' && Boolean(commencedAt));
  const showProposedDelivery = !hasBindingDeadline;

  const showLiveCountdown = status === 'commenced';

  useEffect(() => {
    if (!dueAt || !showLiveCountdown) return;
    const handle = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(handle);
  }, [dueAt, showLiveCountdown]);

  if (showProposedDelivery) {
    if (
      proposedDeliveryDurationValue == null ||
      !proposedDeliveryDurationUnit
    ) {
      return null;
    }
    return (
      <RequestCallout tone="info" title="Proposed delivery">
        <p className="text-sm font-semibold text-ink">
          {formatDeliveryInDuration(proposedDeliveryDurationValue, proposedDeliveryDurationUnit)}
        </p>
        <p className="text-sm text-muted">{proposedDeliveryExplainer(viewerIsWorker)}</p>
      </RequestCallout>
    );
  }

  if (!dueAt) return null;

  const deadline = new Date(dueAt);
  const overdue = status === 'commenced' && isPast(deadline);
  const countdown = formatDeliveryRemaining(dueAt, now);
  const calendarLabel = formatDeliveryInstantLabel(dueAt, null);

  const title = overdue
    ? 'Past delivery deadline'
    : status === 'completed'
      ? 'Delivery deadline'
      : 'Delivery deadline';

  return (
    <RequestCallout
      tone={overdue ? 'danger' : status === 'completed' ? 'info' : 'warning'}
      title={title}
    >
      <div className="flex flex-col gap-1">
        {showLiveCountdown && countdown ? (
          <p className="text-sm font-semibold text-ink">{countdown}</p>
        ) : (
          <p className="text-sm text-ink">
            {status === 'completed' ? formatWhenHome(dueAt) : `Due ${formatWhenHome(dueAt)}`}
          </p>
        )}
        {status === 'commenced' && calendarLabel ? (
          <p className="text-sm text-muted">{calendarLabel}</p>
        ) : null}
        {status === 'commenced' ? (
          <p className="text-sm text-muted">{bindingDeadlineExplainer()}</p>
        ) : null}
      </div>
    </RequestCallout>
  );
}