import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ProfilePhotoCaptureContent } from '@/components/profile/ProfilePhotoCaptureContent';
import { Button } from '@/components/ui/Button';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { IconButton } from '@/components/ui/IconButton';
import { KeyboardStickyFooter } from '@/components/ui/KeyboardStickyFooter';
import { InlineError } from '@/components/ui/StateView';
import { hasProfilePhotoReady, useCaptureProfilePhoto, useProfile } from '@/features/profile/api';
import { CheckboxRow } from '@/components/ui/CheckboxRow';
import { MilestonePlanEditor } from '@/components/request-flow/MilestonePlanEditor';
import {
  ProposedDeliveryPicker,
  defaultProposedDeliveryDate,
} from '@/components/request-flow/ProposedDeliveryPicker';
import {
  DEFAULT_PROPOSED_DELIVERY_TIMEZONE,
  validateProposedDeliveryAt,
} from '@/features/requests/engagement-lifecycle';
import {
  counterOfferForRpc,
  parseResponseOfferAmount,
  type RespondableRequest,
} from '@/features/requests/responses-api';
import {
  defaultMilestoneDraftItems,
  milestoneDraftsAllocatedMajor,
  validateMilestoneDraftItems,
  type MilestoneDraftItem,
  type MilestoneProposalItem,
  type MilestoneRpcItem,
} from '@/features/requests/milestones';
import { cn } from '@/lib/cn';
import { showAppToast } from '@/lib/toast';
import { poppinsInputTypography } from '@/theme/fonts';
import { useColors } from '@/theme';

const responseMessageTypography = poppinsInputTypography('regular', 'base', { multiline: true });

const OFFER_STEP = 500;
const MESSAGE_MAX = 500;

type ResponseCreationFlowProps = {
  step: number;
  onStepChange: (next: number) => void;
  onExit: () => void;
  request: RespondableRequest;
  initialYourOffer: string;
  initialMessage: string;
  needsPhotoStep: boolean;
  isUpdate: boolean;
  submitting: boolean;
  submitError: Error | null;
  onSubmit: (input: {
    message: string | null;
    quotedAmount: number | null;
    proposedDeliveryAt: Date;
    proposedDeliveryTimezone: string;
    milestoneProposal?: MilestoneRpcItem[] | null;
  }) => void;
  milestoneMode?: boolean;
  requesterMilestones?: MilestoneProposalItem[];
};

function StepProgress({ step, stepCount }: { step: number; stepCount: number }) {
  return (
    <View className="flex-row gap-1">
      {Array.from({ length: stepCount }, (_, index) => (
        <View
          key={index}
          className={cn('h-1 w-7 rounded-full', index <= step ? 'bg-active' : 'bg-surface')}
        />
      ))}
    </View>
  );
}

function ResponseWizardHeader({
  step,
  stepCount,
  onBack,
}: {
  step: number;
  stepCount: number;
  onBack: () => void;
}) {
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
      <StepProgress step={step} stepCount={stepCount} />
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
  editable = true,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onAdjust: (delta: number) => void;
  error: string | null;
  editable?: boolean;
}) {
  const colors = useColors();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole="none"
        onPress={() => inputRef.current?.focus()}
        className="rounded-2xl bg-surface px-5 py-6"
      >
        <MoneyAmountInput
          inputRef={inputRef}
          accessibilityLabel="Your offer amount"
          value={value}
          onChangeText={(text) => onChangeText(text.replace(/[^\d]/g, ''))}
          trailing={
            editable ? (
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
            ) : undefined
          }
        />
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
  needsPhotoStep,
  isUpdate,
  submitting,
  submitError,
  onSubmit,
  milestoneMode = false,
  requesterMilestones = [],
}: ResponseCreationFlowProps) {
  const colors = useColors();
  const profile = useProfile();
  const capturePhoto = useCaptureProfilePhoto();
  const [yourOffer, setYourOffer] = useState(initialYourOffer);
  const [message, setMessage] = useState(initialMessage);
  const messageInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [proposeMilestones, setProposeMilestones] = useState(false);
  const [milestoneDrafts, setMilestoneDrafts] = useState<MilestoneDraftItem[]>(() =>
    requesterMilestones.length >= 2
      ? requesterMilestones.map((item) => ({
          id: `seed-${item.position}`,
          title: item.title,
          description: item.description,
          amount: String(item.amount),
        }))
      : defaultMilestoneDraftItems(),
  );
  const [milestoneValidationMessage, setMilestoneValidationMessage] = useState<string | null>(null);
  const [proposedDeliveryAt, setProposedDeliveryAt] = useState(() => defaultProposedDeliveryDate());

  const stepCount = needsPhotoStep ? 4 : 3;
  const offerStep = needsPhotoStep ? 1 : 0;
  const messageStep = needsPhotoStep ? 2 : 1;
  const deliveryStep = needsPhotoStep ? 3 : 2;
  const photoReady = hasProfilePhotoReady(profile.data);

  const requesterOffer = request.offered_amount;
  if (requesterOffer === null) {
    throw new Error('Request offer is required to respond.');
  }

  const parsedYourOffer = parseResponseOfferAmount(yourOffer);
  const parsedInitialOffer = parseResponseOfferAmount(initialYourOffer);

  const offerError = (() => {
    if (parsedYourOffer === null) return 'Enter a valid amount.';
    if (parsedYourOffer <= 0) return 'Enter an amount greater than zero.';
    return null;
  })();

  const offerStepReady =
    (parsedYourOffer !== null && parsedYourOffer > 0) ||
    (isUpdate && parsedInitialOffer !== null && parsedInitialOffer > 0);

  const adjustOffer = (delta: number) => {
    const parsed = parseResponseOfferAmount(yourOffer) ?? 0;
    const next = Math.max(0, parsed + delta);
    setYourOffer(String(next));
  };

  const agreedTotal = useMemo(() => {
    const offerRaw =
      parsedYourOffer !== null && parsedYourOffer > 0 ? yourOffer : initialYourOffer;
    const parsed = parseResponseOfferAmount(offerRaw);
    if (parsed !== null && parsed > 0) return parsed;
    return requesterOffer;
  }, [initialYourOffer, parsedYourOffer, requesterOffer, yourOffer]);

  const send = () => {
    if (!offerStepReady) return;
    if (needsPhotoStep && !photoReady) {
      onStepChange(0);
      return;
    }
    const offerRaw = parsedYourOffer !== null && parsedYourOffer > 0 ? yourOffer : initialYourOffer;
    const quoted = counterOfferForRpc(requesterOffer, offerRaw);
    if (quoted === 'invalid') return;

    let milestoneProposal: MilestoneRpcItem[] | null | undefined;
    if (milestoneMode && proposeMilestones) {
      const validation = validateMilestoneDraftItems(milestoneDrafts, agreedTotal);
      if (!validation.ok) {
        setMilestoneValidationMessage(validation.message);
        showAppToast(validation.message, 'warning');
        return;
      }
      milestoneProposal = validation.items;
    }

    const deliveryValidation = validateProposedDeliveryAt(proposedDeliveryAt);
    if (deliveryValidation) {
      showAppToast(deliveryValidation, 'warning');
      return;
    }

    onSubmit({
      message: message.trim() || null,
      quotedAmount: quoted,
      proposedDeliveryAt,
      proposedDeliveryTimezone: DEFAULT_PROPOSED_DELIVERY_TIMEZONE,
      milestoneProposal: milestoneMode ? (milestoneProposal ?? null) : undefined,
    });
  };

  const handleHeaderBack = () => {
    if (step === 0) onExit();
    else onStepChange(step - 1);
  };

  const offerStepNumber = needsPhotoStep ? 2 : 1;
  const messageStepNumber = needsPhotoStep ? 3 : 2;
  const deliveryStepNumber = needsPhotoStep ? 4 : 3;
  const deliveryValidation = validateProposedDeliveryAt(proposedDeliveryAt);

  const syncOfferFromMilestoneDrafts = (drafts: MilestoneDraftItem[]) => {
    setMilestoneDrafts(drafts);
    const allocated = milestoneDraftsAllocatedMajor(drafts);
    if (allocated > 0) {
      setYourOffer(String(allocated));
    }
  };

  const handleProposeMilestonesChange = (next: boolean) => {
    setProposeMilestones(next);
    setMilestoneValidationMessage(null);
    if (next) {
      const allocated = milestoneDraftsAllocatedMajor(milestoneDrafts);
      if (allocated > 0) {
        setYourOffer(String(allocated));
      }
    }
  };

  return (
    <KeyboardStickyFooter
      footer={
        <View className="gap-3 p-5">
          {needsPhotoStep && step === 0 ? (
            <Button
              label={
                photoReady
                  ? 'Continue'
                  : capturePhoto.isPending
                    ? 'Opening camera…'
                    : 'Take profile photo'
              }
              size="lg"
              variant={photoReady ? 'active' : 'secondary'}
              loading={capturePhoto.isPending}
              onPress={() => {
                if (photoReady) {
                  onStepChange(offerStep);
                  return;
                }
                capturePhoto.mutate(
                  {},
                  {
                    onSuccess: (saved) => {
                      if (saved) showAppToast('Profile updated');
                    },
                  },
                );
              }}
            />
          ) : null}

          {step === offerStep ? (
            <WizardPrimaryButton
              label="Next"
              disabled={!offerStepReady}
              onPress={() => onStepChange(messageStep)}
            />
          ) : null}

          {step === messageStep ? (
            <View className="flex-row items-stretch gap-3">
              <WizardSecondaryButton label="Back" onPress={() => onStepChange(offerStep)} />
              <WizardPrimaryButton
                label="Next"
                disabled={!offerStepReady}
                onPress={() => onStepChange(deliveryStep)}
                className="flex-1"
              />
            </View>
          ) : null}

          {step === deliveryStep ? (
            <View className="flex-row items-stretch gap-3">
              <WizardSecondaryButton label="Back" onPress={() => onStepChange(messageStep)} />
              <WizardPrimaryButton
                label={isUpdate ? 'Edit response' : 'Send Response'}
                disabled={!offerStepReady || deliveryValidation !== null}
                loading={submitting}
                onPress={send}
                className="flex-1"
              />
            </View>
          ) : null}
        </View>
      }
    >
      <ResponseWizardHeader step={step} stepCount={stepCount} onBack={handleHeaderBack} />

      <ScrollView
        contentContainerClassName="gap-5 p-5 pb-8"
        keyboardShouldPersistTaps="handled"
        className="flex-1"
      >
        {needsPhotoStep && step === 0 ? (
          <View className="gap-5">
            <StepLabel>{`Step 1 of ${stepCount} · Photo`}</StepLabel>
            <ProfilePhotoCaptureContent
              variant="respond"
              avatarPath={profile.data?.avatar_path}
              displayName={profile.data?.display_name}
              error={capturePhoto.isError ? capturePhoto.error : null}
            />
          </View>
        ) : null}

        {step === offerStep ? (
          <View className="gap-3">
            <StepLabel>{`Step ${offerStepNumber} of ${stepCount} · Offer`}</StepLabel>
            <Text className="text-3xl font-bold leading-9 text-ink">What are you offering?</Text>
            <Text className="text-base leading-6 text-muted">
              &ldquo;{request.title}&rdquo; — keep the amount or propose something different.
            </Text>
            <Text className="text-sm leading-5 text-muted">{request.description}</Text>

            <OfferAmountStepper
              value={yourOffer}
              onChangeText={setYourOffer}
              onAdjust={adjustOffer}
              error={offerError}
              editable={!(milestoneMode && proposeMilestones)}
            />

            {milestoneMode ? (
              <>
                <CheckboxRow
                  label="Propose different milestones"
                  checked={proposeMilestones}
                  onChange={handleProposeMilestonesChange}
                />

                {proposeMilestones ? (
                  <MilestonePlanEditor
                    items={milestoneDrafts}
                    onChange={syncOfferFromMilestoneDrafts}
                    totalMajor={agreedTotal}
                    validationMessage={milestoneValidationMessage}
                    showIntro={false}
                  />
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        {step === messageStep ? (
          <View className="gap-3">
            <StepLabel>{`Step ${messageStepNumber} of ${stepCount} · Message`}</StepLabel>
            <Text className="text-3xl font-bold leading-9 text-ink">Say something</Text>
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
              className="min-h-44 rounded-2xl bg-surface px-4 py-4 text-ink"
              style={responseMessageTypography}
            />

            <Text className="text-sm text-muted">
              Keep it brief. The requester reads this before choosing.
            </Text>

          </View>
        ) : null}

        {step === deliveryStep ? (
          <View className="gap-3">
            <StepLabel>{`Step ${deliveryStepNumber} of ${stepCount} · Delivery`}</StepLabel>
            <ProposedDeliveryPicker
              value={proposedDeliveryAt}
              onChange={setProposedDeliveryAt}
              error={deliveryValidation}
            />
            {submitError ? <InlineError error={submitError} /> : null}
          </View>
        ) : null}

      </ScrollView>
    </KeyboardStickyFooter>
  );
}
