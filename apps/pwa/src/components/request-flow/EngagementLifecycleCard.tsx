'use client';

import { useEffect, useState } from 'react';

import { RequestCallout } from '@/components/request-flow/RequestCallout';
import {
  type DeliveryDurationUnit,
  formatDeliveryInDuration,
  formatDeliveryRemaining,
  proposedDeliveryLabelFromRow,
} from '@/features/requests/delivery-duration';
import {
  canDismissFailureToStart,
  canDismissMissedDeliveryUi,
  formatCountdownDuration,
  formatDeliveryInstantLabel,
  helperShowStartButton,
  proposedDeliveryExplainerForHelper,
  proposedDeliveryExplainerForRequester,
  startWindowRemainingMs,
} from '@/features/requests/engagement-lifecycle';

type EngagementLifecycleCardProps = {
  viewerIsRequester: boolean;
  requestStatus: string;
  paymentStatus: string | null;
  acceptedAt: string | null;
  startByAt: string | null;
  startedAt: string | null;
  proposedDeliveryDurationValue: number | null;
  proposedDeliveryDurationUnit: DeliveryDurationUnit | null;
  proposedDeliveryAt: string | null;
  proposedDeliveryTimezone: string | null;
  adjustedDeliveryAt: string | null;
  deliveryDeadlineAt: string | null;
};

export function EngagementLifecycleCard(props: EngagementLifecycleCardProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const needsTick =
      (props.requestStatus === 'accepted' && !props.startedAt && props.startByAt) ||
      (Boolean(props.deliveryDeadlineAt) && props.requestStatus === 'in_progress');
    if (!needsTick) return;

    const handle = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(handle);
  }, [props.deliveryDeadlineAt, props.requestStatus, props.startByAt, props.startedAt]);

  const startRemaining = startWindowRemainingMs(props.startByAt, now);
  const showHelperStartHint = helperShowStartButton({
    viewerIsRequester: props.viewerIsRequester,
    requestStatus: props.requestStatus,
    startedAt: props.startedAt,
    startByAt: props.startByAt,
    now,
  });
  const proposedLabel =
    props.proposedDeliveryDurationValue != null && props.proposedDeliveryDurationUnit
      ? formatDeliveryInDuration(
          props.proposedDeliveryDurationValue,
          props.proposedDeliveryDurationUnit,
        )
      : proposedDeliveryLabelFromRow({
          proposed_delivery_duration_value: props.proposedDeliveryDurationValue,
          proposed_delivery_duration_unit: props.proposedDeliveryDurationUnit,
          proposed_delivery_at: props.proposedDeliveryAt,
          proposed_delivery_timezone: props.proposedDeliveryTimezone,
          formatCalendar: formatDeliveryInstantLabel,
        });
  const bindingCalendarLabel = formatDeliveryInstantLabel(
    props.deliveryDeadlineAt ?? props.adjustedDeliveryAt,
    props.proposedDeliveryTimezone,
  );
  const bindingCountdownLabel = formatDeliveryRemaining(
    props.deliveryDeadlineAt ?? props.adjustedDeliveryAt,
    now,
  );
  const hasStarted = Boolean(props.startedAt) || props.requestStatus === 'in_progress';

  const showStartCountdown =
    !props.startedAt &&
    props.requestStatus === 'accepted' &&
    props.startByAt &&
    startRemaining !== null;

  const failureDismissAvailable = canDismissFailureToStart({
    viewerIsRequester: props.viewerIsRequester,
    requestStatus: props.requestStatus,
    startedAt: props.startedAt,
    startByAt: props.startByAt,
    now,
  });

  const missedDismissWindow = canDismissMissedDeliveryUi({
    viewerIsRequester: props.viewerIsRequester,
    requestStatus: props.requestStatus,
    startedAt: props.startedAt,
    deliveryDeadlineAt: props.deliveryDeadlineAt,
    paymentStatus: props.paymentStatus,
    now,
  });

  if (!proposedLabel && !showStartCountdown && !bindingCountdownLabel && !bindingCalendarLabel) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {props.viewerIsRequester && showStartCountdown ? (
        <RequestCallout
          tone={startRemaining !== null && startRemaining > 0 ? 'warning' : 'danger'}
          title={
            startRemaining !== null && startRemaining > 0
              ? 'Waiting for them to start'
              : 'Start window ended'
          }
        >
          {startRemaining !== null && startRemaining > 0 ? (
            <p className="text-sm text-muted">
              They have {formatCountdownDuration(startRemaining)} left to press Start (24-hour window
              from when you accepted).
            </p>
          ) : (
            <p className="text-sm text-muted">
              They did not press Start in time. You can end the engagement for failure to start if you
              choose.
            </p>
          )}
        </RequestCallout>
      ) : null}

      {!props.viewerIsRequester && showHelperStartHint && startRemaining !== null ? (
        <RequestCallout tone="info" title="Press Start to begin">
          <p className="text-sm text-muted">
            {startRemaining > 0
              ? `Accepted — you have ${formatCountdownDuration(startRemaining)} to press Start.`
              : 'The start window has ended.'}
          </p>
          <p className="text-sm text-muted">{proposedDeliveryExplainerForHelper(hasStarted)}</p>
        </RequestCallout>
      ) : null}

      {proposedLabel ? (
        <RequestCallout tone="info" title="Proposed delivery">
          <p className="text-sm font-semibold text-ink">{proposedLabel}</p>
          <p className="text-sm text-muted">
            {props.viewerIsRequester
              ? proposedDeliveryExplainerForRequester(hasStarted)
              : proposedDeliveryExplainerForHelper(hasStarted)}
          </p>
        </RequestCallout>
      ) : null}

      {hasStarted && (bindingCountdownLabel || bindingCalendarLabel) ? (
        <RequestCallout tone="info" title="Binding delivery deadline">
          {bindingCountdownLabel ? (
            <p className="text-sm font-semibold text-ink">{bindingCountdownLabel}</p>
          ) : null}
          {bindingCalendarLabel ? (
            <p className="text-sm text-muted">{bindingCalendarLabel}</p>
          ) : null}
          <p className="text-sm text-muted">Set by the server when work started.</p>
        </RequestCallout>
      ) : null}

      {props.viewerIsRequester && missedDismissWindow ? (
        <RequestCallout tone="warning" title="Delivery deadline passed">
          <p className="text-sm text-muted">
            If they missed the binding deadline, you may end the engagement for missed delivery when
            the server confirms eligibility.
          </p>
        </RequestCallout>
      ) : null}

      {props.viewerIsRequester && failureDismissAvailable ? (
        <p className="text-xs text-subtle">
          Failure-to-start dismissal is available below — separate from missed delivery.
        </p>
      ) : null}
    </div>
  );
}