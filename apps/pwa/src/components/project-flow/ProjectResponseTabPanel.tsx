'use client';

import { ExistingResponseCard } from '@/components/request-flow/ExistingResponseCard';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { Button } from '@/components/ui/Button';
import { IonIcon } from '@/components/ui/IonIcon';
import { InlineError } from '@/components/ui/StateView';
import { ionIcons } from '@/components/ui/ion-icons';
import { MARKET } from '@/config';
import type { ExistingResponse } from '@/features/requests/responses-api';
import { useColors } from '@/theme/ThemeProvider';

export function ProjectResponseTabPanel({
  budgetMajor,
  existingResponse,
  respondAllowed,
  respondError,
  withdrawError,
  withdrawLoading,
  onBeginRespond,
  onEditResponse,
  onCancelResponse,
}: {
  budgetMajor: number;
  existingResponse: ExistingResponse | null;
  respondAllowed: boolean;
  respondError: Error | null;
  withdrawError: Error | null;
  withdrawLoading: boolean;
  onBeginRespond: () => void;
  onEditResponse: () => void;
  onCancelResponse: () => void;
}) {
  const colors = useColors();

  return (
    <div className="flex flex-col gap-6 pb-2">
      {!respondAllowed ? (
        <RequestCallout tone="warning" title="Not open for responses">
          <p className="text-sm text-muted">
            This project is not accepting new worker responses right now.
          </p>
        </RequestCallout>
      ) : null}

      {existingResponse ? (
        <ExistingResponseCard
          currency={MARKET.currency}
          quotedAmount={existingResponse.quotedAmount}
          requesterOffer={budgetMajor}
          message={existingResponse.message}
          proposedDeliveryDurationValue={existingResponse.proposedDeliveryDurationValue}
          proposedDeliveryDurationUnit={existingResponse.proposedDeliveryDurationUnit}
          compactPendingStatus
          pendingStatusLabel="Awaiting review"
          onEdit={onEditResponse}
          onCancel={onCancelResponse}
          cancelLoading={withdrawLoading}
        />
      ) : respondAllowed ? (
        <div className="flex flex-row items-start gap-3 rounded-2xl bg-surface p-4">
          <IonIcon icon={ionIcons['lock-closed-outline']} size={18} color={colors.muted} />
          <p className="flex-1 text-sm text-muted">
            The creator sees your profile and proposed compensation. Exact contact details are shared
            after they accept your response.
          </p>
        </div>
      ) : null}

      {respondError ? <InlineError error={respondError} /> : null}
      {withdrawError ? <InlineError error={withdrawError} /> : null}

      {!existingResponse && respondAllowed ? (
        <Button
          label="Respond to project"
          variant="active"
          size="lg"
          corner="2xl"
          onClick={onBeginRespond}
        />
      ) : null}

    </div>
  );
}