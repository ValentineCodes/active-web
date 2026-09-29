import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { InlineError } from '@/components/ui/StateView';
import { TextField } from '@/components/ui/TextField';
import {
  counterOfferForRpc,
  parseResponseOfferAmount,
  type RespondableRequest,
} from '@/features/requests/responses-api';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import type { Position } from '@/lib/location';
import { colors } from '@/theme';

const STEP_COUNT = 2;

type ResponseCreationFlowProps = {
  step: number;
  setStep: (next: number) => void;
  request: RespondableRequest;
  initialYourOffer: number;
  initialMessage: string;
  position: Position;
  isUpdate: boolean;
  submitting: boolean;
  submitError: Error | null;
  onSubmit: (input: { message: string | null; quotedAmount: number | null }) => void;
};

export function ResponseCreationFlow({
  step,
  setStep,
  request,
  initialYourOffer,
  initialMessage,
  position,
  isUpdate,
  submitting,
  submitError,
  onSubmit,
}: ResponseCreationFlowProps) {
  const [yourOffer, setYourOffer] = useState(String(initialYourOffer));
  const [message, setMessage] = useState(initialMessage);

  const requesterOffer = request.offered_amount;
  if (requesterOffer === null) {
    throw new Error('Request offer is required to respond.');
  }

  const offerError = (() => {
    const parsed = parseResponseOfferAmount(yourOffer);
    if (parsed === null) return 'Enter a valid amount.';
    return null;
  })();

  const goNext = () => {
    if (offerError) return;
    setStep(1);
  };

  const send = () => {
    if (offerError) return;
    const quoted = counterOfferForRpc(requesterOffer, yourOffer);
    if (quoted === 'invalid') return;
    onSubmit({ message: message.trim() || null, quotedAmount: quoted });
  };

  const canSend = Boolean(position) && !offerError;

  return (
    <View className="flex-1">
      <View className="flex-row gap-1 px-5 pb-2">
        {Array.from({ length: STEP_COUNT }, (_, index) => (
          <View
            key={index}
            className={cn('h-1 flex-1 rounded-full', index <= step ? 'bg-brand' : 'bg-surface')}
          />
        ))}
      </View>

      <ScrollView contentContainerClassName="gap-6 p-5 pb-12" keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <View className="gap-6">
            <View className="gap-2">
              <Text className="text-2xl font-bold text-ink">Counter offer</Text>
              <Text className="text-base text-muted">
                Keep their offer or change it — no need to negotiate if their price works for you.
              </Text>
            </View>

            <View className="gap-2 rounded-2xl bg-surface p-4">
              <Text className="text-sm font-semibold text-muted">They&apos;re offering</Text>
              <Text className="text-3xl font-bold text-ink">
                {formatMoney(requesterOffer, request.currency)}
              </Text>
            </View>

            <TextField
              label="Your offer"
              value={yourOffer}
              onChangeText={setYourOffer}
              keyboardType="numeric"
              placeholder={String(requesterOffer)}
              error={offerError}
            />

            <Button label="Continue" size="lg" disabled={Boolean(offerError)} onPress={goNext} />
          </View>
        ) : (
          <View className="gap-6">
            <View className="gap-2">
              <Text className="text-2xl font-bold text-ink">
                Anything you&apos;d like them to know?
              </Text>
              <Text className="text-base text-muted">
                Optional — a short note helps them choose.
              </Text>
            </View>

            <TextField
              label="Optional note"
              value={message}
              onChangeText={setMessage}
              placeholder="I can be there in about 15 minutes."
              multiline
              numberOfLines={4}
              maxLength={500}
              counterMax={500}
            />

            <View className="flex-row items-start gap-3 rounded-2xl bg-surface p-4">
              <Ionicons name="information-circle-outline" size={18} color={colors.muted} />
              <Text className="flex-1 text-sm text-muted">
                Sending a response does not commit you. You can respond to many requests; only being
                selected starts the job.
              </Text>
            </View>

            {submitError ? <InlineError error={submitError} /> : null}

            <Button
              label={isUpdate ? 'Update response' : 'Send response'}
              size="lg"
              disabled={!canSend}
              loading={submitting}
              onPress={send}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
