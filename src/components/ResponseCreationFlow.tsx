import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { IconButton } from '@/components/ui/IconButton';
import { InlineError } from '@/components/ui/StateView';
import {
  counterOfferForRpc,
  parseResponseOfferAmount,
  type RespondableRequest,
} from '@/features/requests/responses-api';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import type { Position } from '@/lib/location';
import { useColors } from '@/theme';

const STEP_COUNT = 2;
const OFFER_STEP = 500;
const MESSAGE_MAX = 500;

type ResponseCreationFlowProps = {
  step: number;
  onStepChange: (next: number) => void;
  onExit: () => void;
  request: RespondableRequest;
  initialYourOffer: number;
  initialMessage: string;
  position: Position;
  isUpdate: boolean;
  submitting: boolean;
  submitError: Error | null;
  onSubmit: (input: { message: string | null; quotedAmount: number | null }) => void;
};

function StepProgress({ step }: { step: number }) {
  return (
    <View className="flex-row gap-1">
      {Array.from({ length: STEP_COUNT }, (_, index) => (
        <View
          key={index}
          className={cn('h-1 w-7 rounded-full', index <= step ? 'bg-active' : 'bg-surface')}
        />
      ))}
    </View>
  );
}

function ResponseWizardHeader({ step, onBack }: { step: number; onBack: () => void }) {
  return (
    <View className="flex-row items-center gap-2 px-4 py-3">
      <IconButton
        icon="chevron-back"
        variant="surface"
        accessibilityLabel="Go back"
        onPress={onBack}
      />
      <Text className="flex-1 text-xl font-bold text-ink" numberOfLines={1}>
        Your response
      </Text>
      <StepProgress step={step} />
    </View>
  );
}

function WizardPrimaryButton({
  label,
  disabled,
  loading,
  onPress,
  className,
}: {
  label: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  className?: string;
}) {
  const colors = useColors();
  const inert = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      onPress={onPress}
      className={cn(
        'items-center justify-center rounded-2xl px-6 py-4 active:opacity-90',
        inert ? 'bg-surface' : 'bg-active',
        className,
      )}
    >
      {loading ? (
        <ActivityIndicator color={inert ? colors.subtle : colors.onBrand} />
      ) : (
        <Text className={cn('text-lg font-bold', inert ? 'text-subtle' : 'text-on-brand')}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function WizardSecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="items-center justify-center rounded-2xl bg-surface px-7 py-4 active:opacity-90"
    >
      <Text className="text-base font-semibold text-muted">{label}</Text>
    </Pressable>
  );
}

function StepLabel({ children }: { children: string }) {
  return (
    <Text className="text-xs font-bold uppercase tracking-widest text-subtle">{children}</Text>
  );
}

function OfferAmountStepper({
  value,
  onChangeText,
  onAdjust,
  error,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onAdjust: (delta: number) => void;
  error: string | null;
}) {
  const colors = useColors();
  const inputRef = useRef<TextInputType>(null);

  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole="none"
        onPress={() => inputRef.current?.focus()}
        className="flex-row items-center rounded-2xl bg-surface px-5 py-6"
      >
        <Text className="text-3xl font-bold text-active">₦</Text>
        <TextInput
          ref={inputRef}
          accessibilityLabel="Your offer amount"
          value={value}
          onChangeText={(text) => onChangeText(text.replace(/[^\d]/g, ''))}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.subtle}
          className="min-w-0 flex-1 px-2 py-0 text-3xl font-bold text-ink"
          maxLength={9}
        />
        <View className="gap-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increase offer"
            hitSlop={8}
            onPress={() => onAdjust(OFFER_STEP)}
            className="items-center justify-center rounded-lg bg-elevated p-1"
          >
            <Ionicons name="chevron-up" size={18} color={colors.muted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrease offer"
            hitSlop={8}
            onPress={() => onAdjust(-OFFER_STEP)}
            className="items-center justify-center rounded-lg bg-elevated p-1"
          >
            <Ionicons name="chevron-down" size={18} color={colors.muted} />
          </Pressable>
        </View>
      </Pressable>
      {error ? <Text className="text-sm text-warning">{error}</Text> : null}
    </View>
  );
}

export function ResponseCreationFlow({
  step,
  onStepChange,
  onExit,
  request,
  initialYourOffer,
  initialMessage,
  position,
  isUpdate,
  submitting,
  submitError,
  onSubmit,
}: ResponseCreationFlowProps) {
  const colors = useColors();
  const [yourOffer, setYourOffer] = useState(String(initialYourOffer));
  const [message, setMessage] = useState(initialMessage);
  const messageInputRef = useRef<TextInputType>(null);

  const requesterOffer = request.offered_amount;
  if (requesterOffer === null) {
    throw new Error('Request offer is required to respond.');
  }

  const offerError = (() => {
    const parsed = parseResponseOfferAmount(yourOffer);
    if (parsed === null) return 'Enter a valid amount.';
    if (parsed <= 0) return 'Enter an amount greater than zero.';
    return null;
  })();

  const adjustOffer = (delta: number) => {
    const parsed = parseResponseOfferAmount(yourOffer) ?? 0;
    const next = Math.max(0, parsed + delta);
    setYourOffer(String(next));
  };

  const goNext = () => {
    if (offerError) return;
    onStepChange(1);
  };

  const send = () => {
    if (offerError) return;
    const quoted = counterOfferForRpc(requesterOffer, yourOffer);
    if (quoted === 'invalid') return;
    onSubmit({ message: message.trim() || null, quotedAmount: quoted });
  };

  const canSend = Boolean(position) && !offerError;

  const handleHeaderBack = () => {
    if (step === 0) onExit();
    else onStepChange(0);
  };

  return (
    <View className="flex-1">
      <ResponseWizardHeader step={step} onBack={handleHeaderBack} />

      <ScrollView
        contentContainerClassName="gap-5 p-5 pb-8"
        keyboardShouldPersistTaps="handled"
        className="flex-1"
      >
        {step === 0 ? (
          <View className="gap-3">
            <StepLabel>Step 1 of 2 · Offer</StepLabel>
            <Text className="font-serif text-3xl font-bold leading-9 text-ink">
              What are you offering?
            </Text>
            <Text className="text-base leading-6 text-muted">
              &ldquo;{request.title}&rdquo; — keep the amount or propose something different.
            </Text>

            <OfferAmountStepper
              value={yourOffer}
              onChangeText={setYourOffer}
              onAdjust={adjustOffer}
              error={offerError}
            />

            <Text className="text-sm text-muted">
              Requester is offering {formatMoney(requesterOffer, request.currency)}.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            <StepLabel>Step 2 of 2 · Message</StepLabel>
            <Text className="font-serif text-3xl font-bold leading-9 text-ink">Say something</Text>
            <Text className="text-base leading-6 text-muted">
              Optional. A short message explaining how you can help.
            </Text>

            <TextInput
              ref={messageInputRef}
              accessibilityLabel="Message to the requester"
              value={message}
              onChangeText={setMessage}
              placeholder="I can help with this because…"
              placeholderTextColor={colors.subtle}
              multiline
              maxLength={MESSAGE_MAX}
              textAlignVertical="top"
              className="min-h-44 rounded-2xl bg-surface px-4 py-4 text-base leading-6 text-ink"
            />

            <Text className="text-sm text-muted">
              Keep it brief. The requester reads this before choosing.
            </Text>

            {submitError ? <InlineError error={submitError} /> : null}
          </View>
        )}
      </ScrollView>

      <View className="gap-3 border-t border-hairline p-5">
        {step === 0 ? (
          <WizardPrimaryButton label="Next" disabled={Boolean(offerError)} onPress={goNext} />
        ) : (
          <View className="flex-row items-stretch gap-3">
            <WizardSecondaryButton label="Back" onPress={() => onStepChange(0)} />
            <WizardPrimaryButton
              label={isUpdate ? 'Update response' : 'Send Response'}
              disabled={!canSend}
              loading={submitting}
              onPress={send}
              className="flex-1"
            />
          </View>
        )}
      </View>
    </View>
  );
}
