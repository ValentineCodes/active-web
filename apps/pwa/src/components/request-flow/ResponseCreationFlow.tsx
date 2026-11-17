'use client';

import { useMemo, useRef, useState } from 'react';

import { MilestonePlanEditor } from '@/components/request-flow/MilestonePlanEditor';
import { LiveProfilePhotoCapture } from '@/components/profile/LiveProfilePhotoCapture';
import { ProfilePhotoCaptureContent } from '@/components/profile/ProfilePhotoCaptureContent';
import { KeyboardStickyFooter } from '@/components/layout/KeyboardStickyFooter';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { IonIcon } from '@/components/ui/IonIcon';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { InlineError } from '@/components/ui/StateView';
import { ionIcons } from '@/components/ui/ion-icons';
import { useUserId } from '@/features/auth/use-user-id';
import { hasProfilePhotoReady, useMyProfile } from '@/features/profile/api';
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
import { useColors } from '@/theme/ThemeProvider';

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
    milestoneProposal?: MilestoneRpcItem[] | null;
  }) => void;
  milestoneMode?: boolean;
  requesterMilestones?: MilestoneProposalItem[];
};

function StepProgress({ step, stepCount }: { step: number; stepCount: number }) {
  return (
    <div className="flex flex-row gap-1">
      {Array.from({ length: stepCount }, (_, index) => (
        <div
          key={index}
          className={cn('h-1 w-7 rounded-full', index <= step ? 'bg-active' : 'bg-surface')}
        />
      ))}
    </div>
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
    <div className="flex flex-row items-center gap-2 px-4 py-3">
      <IconButton icon="chevron-back" variant="surface" accessibilityLabel="Go back" onClick={onBack} />
      <h1 className="flex-1 truncate text-xl font-bold text-ink">Your response</h1>
      <StepProgress step={step} stepCount={stepCount} />
    </div>
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
  const inert = disabled || loading;

  return (
    <button
      type="button"
      aria-label={label}
      disabled={inert}
      onClick={onPress}
      className={cn(
        'flex items-center justify-center rounded-2xl px-6 py-4 text-lg font-bold active:opacity-90',
        inert ? 'bg-surface text-subtle' : 'bg-active text-on-brand',
        className,
      )}
    >
      {loading ? (
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-subtle border-t-transparent"
          aria-hidden
        />
      ) : (
        label
      )}
    </button>
  );
}

function WizardSecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      className="flex items-center justify-center rounded-2xl bg-surface px-7 py-4 text-base font-semibold text-muted active:opacity-90"
    >
      {label}
    </button>
  );
}

function StepLabel({ children }: { children: string }) {
  return <p className="text-xs font-bold uppercase tracking-widest text-subtle">{children}</p>;
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
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-label="Edit offer amount"
        onClick={() => inputRef.current?.focus()}
        className="rounded-2xl bg-surface px-5 py-6 text-left active:opacity-95"
      >
        <MoneyAmountInput
          inputRef={inputRef}
          accessibilityLabel="Your offer amount"
          value={value}
          onChangeText={onChangeText}
          trailing={
            editable ? (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-label="Increase offer"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAdjust(OFFER_STEP);
                  }}
                  className="flex items-center justify-center rounded-lg bg-elevated p-1 active:opacity-80"
                >
                  <IonIcon icon={ionIcons['arrow-up']} size={18} color={colors.muted} />
                </button>
                <button
                  type="button"
                  aria-label="Decrease offer"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAdjust(-OFFER_STEP);
                  }}
                  className="flex items-center justify-center rounded-lg bg-elevated p-1 active:opacity-80"
                >
                  <IonIcon icon={ionIcons['arrow-down']} size={18} color={colors.muted} />
                </button>
              </div>
            ) : undefined
          }
        />
      </button>
      {error ? <p className="text-sm text-warning">{error}</p> : null}
    </div>
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
  const profile = useMyProfile();
  const userId = useUserId();
  const [yourOffer, setYourOffer] = useState(initialYourOffer);
  const [message, setMessage] = useState(initialMessage);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureError, setCaptureError] = useState<Error | null>(null);

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

  const stepCount = needsPhotoStep ? 3 : 2;
  const offerStep = needsPhotoStep ? 1 : 0;
  const messageStep = needsPhotoStep ? 2 : 1;
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

    onSubmit({
      message: message.trim() || null,
      quotedAmount: quoted,
      milestoneProposal: milestoneMode ? (milestoneProposal ?? null) : undefined,
    });
  };

  const handleHeaderBack = () => {
    if (step === 0) onExit();
    else onStepChange(step - 1);
  };

  const offerStepNumber = needsPhotoStep ? 2 : 1;
  const messageStepNumber = needsPhotoStep ? 3 : 2;

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
    <>
      <KeyboardStickyFooter
        footer={
          <div className="flex flex-col gap-3 p-5">
            {needsPhotoStep && step === 0 ? (
              <Button
                label={photoReady ? 'Continue' : 'Take profile photo'}
                size="lg"
                variant={photoReady ? 'active' : 'secondary'}
                onClick={() => {
                  if (photoReady) {
                    onStepChange(offerStep);
                    return;
                  }
                  if (!userId) return;
                  setCaptureError(null);
                  setCaptureOpen(true);
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
              <div className="flex flex-row items-stretch gap-3">
                <WizardSecondaryButton label="Back" onPress={() => onStepChange(offerStep)} />
                <WizardPrimaryButton
                  label={isUpdate ? 'Edit response' : 'Send Response'}
                  disabled={!offerStepReady}
                  loading={submitting}
                  onPress={send}
                  className="flex-1"
                />
              </div>
            ) : null}
          </div>
        }
      >
        <ResponseWizardHeader step={step} stepCount={stepCount} onBack={handleHeaderBack} />

        <div className="flex flex-col gap-5 p-5 pb-8">
          {needsPhotoStep && step === 0 ? (
            <div className="flex flex-col gap-5">
              <StepLabel>Step 1 of 3 · Photo</StepLabel>
              <ProfilePhotoCaptureContent
                variant="respond"
                avatarPath={profile.data?.avatar_path}
                displayName={profile.data?.display_name}
                error={captureError}
              />
            </div>
          ) : null}

          {step === offerStep ? (
            <div className="flex flex-col gap-3">
              <StepLabel>{`Step ${offerStepNumber} of ${stepCount} · Offer`}</StepLabel>
              <h2 className="text-3xl font-bold leading-9 text-ink">What are you offering?</h2>
              <p className="text-base leading-6 text-muted">
                Keep the amount or propose something different.
              </p>

              <OfferAmountStepper
                value={yourOffer}
                onChangeText={setYourOffer}
                onAdjust={adjustOffer}
                error={offerError}
                editable={!(milestoneMode && proposeMilestones)}
              />

              {milestoneMode ? (
                <>
                  <label className="flex flex-row items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
                    <span className="flex-1 text-base font-semibold text-ink">
                      Propose different milestones
                    </span>
                    <input
                      type="checkbox"
                      checked={proposeMilestones}
                      onChange={(e) => handleProposeMilestonesChange(e.target.checked)}
                      className="h-5 w-5 accent-[var(--color-active)]"
                    />
                  </label>

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
            </div>
          ) : null}

          {step === messageStep ? (
            <div className="flex flex-col gap-3">
              <StepLabel>{`Step ${messageStepNumber} of ${stepCount} · Message`}</StepLabel>
              <h2 className="text-3xl font-bold leading-9 text-ink">Say something</h2>
              <p className="text-base leading-6 text-muted">
                Optional. A short message explaining how you can help.
              </p>

              <textarea
                aria-label="Message to the requester"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="I can help with this because…"
                maxLength={MESSAGE_MAX}
                rows={6}
                className="min-h-44 resize-none rounded-2xl bg-surface px-4 py-4 text-base text-ink outline-none placeholder:text-subtle"
              />

              {submitError ? <InlineError error={submitError} /> : null}
            </div>
          ) : null}

        </div>
      </KeyboardStickyFooter>

      {captureOpen && userId ? (
        <div className="fixed inset-0 z-[210] flex flex-col bg-canvas">
          <LiveProfilePhotoCapture
            userId={userId}
            onClose={() => setCaptureOpen(false)}
            onSaved={() => {
              setCaptureOpen(false);
              void profile.refetch();
              showAppToast('Profile updated');
            }}
          />
        </div>
      ) : null}
    </>
  );
}
