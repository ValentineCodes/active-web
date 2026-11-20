import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ExistingResponseCard } from '@/components/request-flow/ExistingResponseCard';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { Button } from '@/components/ui/Button';
import { InlineError } from '@/components/ui/StateView';
import { MARKET } from '@/config';
import type { ExistingResponse } from '@/features/requests/responses-api';
import { useColors } from '@/theme';

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
    <View className="gap-6 pb-2">
      {!respondAllowed ? (
        <RequestCallout tone="warning" title="Not open for responses">
          <Text className="text-sm text-muted">
            This project is not accepting new worker responses right now.
          </Text>
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
          onEdit={onEditResponse}
          onCancel={onCancelResponse}
          cancelLoading={withdrawLoading}
        />
      ) : respondAllowed ? (
        <View className="flex-row items-start gap-3 rounded-2xl bg-surface p-4">
          <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
          <Text className="flex-1 text-sm text-muted">
            The creator sees your profile and proposed compensation. Exact contact details are shared
            after they accept your response.
          </Text>
        </View>
      ) : null}

      {respondError ? <InlineError error={respondError} /> : null}
      {withdrawError ? <InlineError error={withdrawError} /> : null}

      {!existingResponse && respondAllowed ? (
        <Button
          label="Respond to project"
          variant="active"
          size="lg"
          corner="2xl"
          onPress={onBeginRespond}
        />
      ) : null}
    </View>
  );
}