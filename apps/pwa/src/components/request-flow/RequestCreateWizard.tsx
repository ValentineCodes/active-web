'use client';

import { addHours, format, set, startOfTomorrow } from 'date-fns';
import { useEffect, useRef, useState } from 'react';

import { RequestLocationModal } from '@/components/RequestLocationModal';
import { RequestReviewBeforePostCard } from '@/components/request-flow/RequestReviewBeforePostCard';
import { RequestTagPickerAfterNavigation } from '@/components/request-flow/RequestTagPicker';
import { IconButton } from '@/components/ui/IconButton';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons, type IonIconName } from '@/components/ui/ion-icons';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { InlineError } from '@/components/ui/StateView';
import { CREATE_TITLE_LIMITS, DESCRIPTION_LIMITS, MARKET, REQUEST_REQUIRES_FUNDING } from '@/config/index';
import {
  savedLocationPosition,
  useMySavedLocations,
  useTouchSavedLocation,
  useUpsertSavedLocation,
  type SavedLocation,
} from '@/features/profile/saved-locations-api';
import { isFundedOffer, summarizeRequestFunding } from '@/features/requests/funding';
import {
  chooseRequestPhotoFromLibrary,
  takeRequestPhoto,
  uploadRequestPhoto,
} from '@/features/requests/request-media';
import { useCreateRequest } from '@/features/requests/requester-api';
import { MAX_REQUEST_TAGS, type RequestTag } from '@/features/requests/tags';
import { useMyWallet } from '@/features/wallet/api';
import {
  positionErrorMessage,
  readForegroundPermission,
  requestPosition,
  suggestAreaLabel,
  type ForegroundPermission,
  type Position,
} from '@/lib/geolocation';
import { cn } from '@/lib/cn';
import { formatMoney, formatWhenHome } from '@/lib/format';
import { showAppToast } from '@/lib/toast';
import { useUserId } from '@/features/auth/use-user-id';
import { useColors } from '@/theme/ThemeProvider';

const STEP_COUNT = 6;

type WhenMode = 'now' | 'later';

function defaultLaterAt() {
  return set(startOfTomorrow(), { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 });
}

function isFutureSchedule(at: Date) {
  return at.getTime() > Date.now();
}

function whenSummary(mode: WhenMode, laterAt: Date): string {
  if (mode === 'now') return 'Today';
  return formatWhenHome(laterAt.toISOString());
}

function toDateInputValue(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInputValue(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function PhotoSourceButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: IonIconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-3 rounded-2xl bg-surface px-4 py-6 active:opacity-90 disabled:opacity-50"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-active/15">
        <IonIcon icon={ionIcons[icon]} size={24} color={colors.active} />
      </span>
      <span className="text-base font-semibold text-ink">{label}</span>
    </button>
  );
}

function LaterScheduleEditor({
  laterAt,
  laterTimeError,
  onLaterAtChange,
}: {
  laterAt: Date;
  laterTimeError: boolean;
  onLaterAtChange: (next: Date) => void;
}) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const reviewWhen = formatWhenHome(laterAt.toISOString());
  const minDate = toDateInputValue(new Date());
  const maxDate = toDateInputValue(addHours(new Date(), 24 * 30));

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <p className="text-base font-semibold text-ink">{reviewWhen}</p>
      {laterTimeError ? <p className="text-sm text-warning">Choose a time in the future.</p> : null}
      <div className="flex flex-row flex-wrap gap-2">
        <button
          type="button"
          onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
          className="rounded-2xl bg-canvas px-4 py-3 text-base font-semibold text-ink active:opacity-90"
        >
          {format(laterAt, 'd MMM yyyy')}
        </button>
        <button
          type="button"
          onClick={() => timeInputRef.current?.showPicker?.() ?? timeInputRef.current?.click()}
          className="rounded-2xl bg-canvas px-4 py-3 text-base font-semibold text-ink active:opacity-90"
        >
          {format(laterAt, 'HH:mm')}
        </button>
      </div>
      <input
        ref={dateInputRef}
        type="date"
        value={toDateInputValue(laterAt)}
        min={minDate}
        max={maxDate}
        onChange={(e) => {
          const [year, month, day] = e.target.value.split('-').map(Number);
          if (!year || !month || !day) return;
          onLaterAtChange(set(laterAt, { year, month: month - 1, date: day }));
        }}
        className="sr-only"
        tabIndex={-1}
      />
      <input
        ref={timeInputRef}
        type="time"
        value={toTimeInputValue(laterAt)}
        onChange={(e) => {
          const [hours, minutes] = e.target.value.split(':').map(Number);
          if (Number.isNaN(hours) || Number.isNaN(minutes)) return;
          onLaterAtChange(set(laterAt, { hours, minutes, seconds: 0, milliseconds: 0 }));
        }}
        className="sr-only"
        tabIndex={-1}
      />
    </div>
  );
}

function isLocalAttachmentUri(uri: string) {
  return uri.startsWith('blob:') || uri.startsWith('data:');
}

function WizardProgress({ step, stepCount }: { step: number; stepCount: number }) {
  const progress = ((step + 1) / stepCount) * 100;
  return (
    <div className="mx-5 h-1 overflow-hidden rounded-full bg-surface">
      <div className="h-full rounded-full bg-active transition-[width] duration-200" style={{ width: `${progress}%` }} />
    </div>
  );
}

function WizardHeader({
  step,
  stepCount,
  onClose,
  onBack,
}: {
  step: number;
  stepCount: number;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <header className="flex shrink-0 flex-row items-center gap-2 px-4 py-3">
      {onBack ? (
        <IconButton icon="chevron-back" variant="surface" accessibilityLabel="Go back" onClick={onBack} />
      ) : (
        <IconButton icon="close" variant="surface" accessibilityLabel="Close" onClick={onClose} />
      )}
      <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-ink">New request</h1>
      <span className="min-w-10 text-right text-sm font-medium text-subtle">
        {step + 1} / {stepCount}
      </span>
    </header>
  );
}

function WizardPrimaryButton({
  label,
  disabled,
  inactive,
  loading,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  inactive?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  const muted = disabled || loading || inactive;
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        'flex min-h-12 w-full items-center justify-center rounded-2xl px-6 py-4 text-lg font-bold active:opacity-90',
        muted ? 'bg-surface text-subtle' : 'bg-active text-on-brand',
      )}
    >
      {loading ? <span className="text-subtle">…</span> : label}
    </button>
  );
}

function StepTextArea({
  value,
  onChange,
  placeholder,
  maxLength,
  minHeight,
  textClassName,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength: number;
  minHeight: number;
  textClassName: string;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <textarea
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={4}
      className={cn(
        'w-full resize-none rounded-2xl bg-surface px-4 py-4 text-ink outline-none placeholder:text-subtle',
        textClassName,
      )}
      style={{ minHeight }}
    />
  );
}

function WhenPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(
        'flex-1 rounded-2xl px-4 py-4 text-center text-base font-semibold active:opacity-90',
        selected ? 'bg-active text-on-brand' : 'bg-surface text-ink',
      )}
    >
      {label}
    </button>
  );
}

export function RequestCreateWizard({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (href: string) => void;
}) {
  const userId = useUserId();
  const create = useCreateRequest();
  const wallet = useMyWallet();
  const savedLocations = useMySavedLocations();
  const touchSavedLocation = useTouchSavedLocation();
  const upsertSavedLocation = useUpsertSavedLocation();

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [whenMode, setWhenMode] = useState<WhenMode>('now');
  const [laterAt, setLaterAt] = useState(defaultLaterAt);
  const [laterTimeError, setLaterTimeError] = useState(false);
  const [amount, setAmount] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [areaLabel, setAreaLabel] = useState('');
  const [selectedTags, setSelectedTags] = useState<RequestTag[]>([]);
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [attachmentMimeType, setAttachmentMimeType] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationModalLoading, setLocationModalLoading] = useState(false);
  const [locationModalError, setLocationModalError] = useState<string | null>(null);
  const [foregroundPermission, setForegroundPermission] = useState<ForegroundPermission>('undetermined');
  const [saveLocationForFuture, setSaveLocationForFuture] = useState(true);

  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const parsedAmount = amount.trim() ? Number(amount.replace(/[^\d.]/g, '')) : null;
  const amountError =
    parsedAmount !== null && (Number.isNaN(parsedAmount) || parsedAmount < 0)
      ? 'Enter a valid amount.'
      : null;
  const descriptionValid = trimmedDescription.length <= DESCRIPTION_LIMITS.max;

  const stepValid = [
    trimmedTitle.length >= CREATE_TITLE_LIMITS.min && trimmedTitle.length <= CREATE_TITLE_LIMITS.max,
    descriptionValid,
    REQUEST_REQUIRES_FUNDING ? isFundedOffer(parsedAmount) && !amountError : amountError === null,
    whenMode === 'now' || isFutureSchedule(laterAt),
    true,
    true,
  ];

  const isLastStep = step === STEP_COUNT - 1;
  const funding =
    parsedAmount !== null && isFundedOffer(parsedAmount) ? summarizeRequestFunding(parsedAmount) : null;
  const reviewWhen = whenSummary(whenMode, laterAt);
  const formCoreValid = stepValid[0] && stepValid[1] && stepValid[2] && stepValid[3];
  const reviewAmount =
    parsedAmount !== null && isFundedOffer(parsedAmount) ? formatMoney(parsedAmount, MARKET.currency) : null;
  const reviewLocation = areaLabel.trim() || 'My location';

  useEffect(() => {
    if (step > 2) return;
    const id = setTimeout(() => {
      if (step === 0) titleInputRef.current?.focus();
      else if (step === 1) descriptionInputRef.current?.focus();
      else if (step === 2) amountInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(id);
  }, [step]);

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const goNext = () => {
    if (isLastStep) return;
    if (!stepValid[step]) {
      if (step === 0) {
        showAppToast(`Use at least ${CREATE_TITLE_LIMITS.min} characters in the title.`, 'warning');
        return;
      }
      if (step === 1) {
        showAppToast(
          trimmedDescription.length > DESCRIPTION_LIMITS.max
            ? `Keep the description under ${DESCRIPTION_LIMITS.max} characters.`
            : 'Describe what needs to be done to continue.',
          'warning',
        );
        return;
      }
      if (step === 2) {
        showAppToast(amountError ?? 'Enter a valid offer amount to continue.', 'warning');
        return;
      }
      if (step === 3) {
        setLaterTimeError(true);
        showAppToast('Choose a date and time in the future.', 'warning');
        return;
      }
      return;
    }
    setLaterTimeError(false);
    setStep((s) => Math.min(s + 1, STEP_COUNT - 1));
  };

  const setSelectedTagsSafe = (tags: RequestTag[]) => {
    setSelectedTags(tags.slice(0, MAX_REQUEST_TAGS));
  };

  const choosePhoto = async (source: 'camera' | 'library') => {
    try {
      const asset = source === 'camera' ? await takeRequestPhoto() : await chooseRequestPhotoFromLibrary();
      if (!asset) return;
      if (attachmentUri && isLocalAttachmentUri(attachmentUri)) URL.revokeObjectURL(attachmentUri);
      setAttachmentUri(asset.uri);
      setAttachmentMimeType(asset.mimeType ?? null);
    } catch (e) {
      showAppToast(e instanceof Error ? e.message : 'Could not add a photo.', 'warning');
    }
  };

  const uploadAttachmentIfNeeded = async (): Promise<string | null> => {
    if (!attachmentUri || !isLocalAttachmentUri(attachmentUri)) return null;
    if (!userId) throw new Error('Sign in to create a request.');
    setAttachmentUploading(true);
    try {
      return await uploadRequestPhoto(userId, {
        uri: attachmentUri,
        mimeType: attachmentMimeType,
      });
    } finally {
      setAttachmentUploading(false);
    }
  };

  const postWithLocation = async (postPosition: Position, locationLabel: string) => {
    setError(null);
    const scheduledFor: Date | null =
      whenMode === 'now' ? null : isFutureSchedule(laterAt) ? laterAt : null;

    try {
      const attachmentPath = await uploadAttachmentIfNeeded();
      const requestId = await create.mutateAsync({
        title: trimmedTitle,
        description: trimmedDescription,
        position: postPosition,
        locationLabel,
        scheduledFor,
        offeredAmount: parsedAmount!,
        attachmentPath,
        tags: selectedTags.map((tag) => ({ slug: tag.slug })),
      });
      showAppToast('Request posted.');
      onSuccess(`/request/${requestId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the request.');
    }
  };

  const finishPostWithPlace = async (postPosition: Position, locationLabel: string) => {
    setPosition(postPosition);
    setAreaLabel(locationLabel);
    setLocationModalLoading(false);
    setLocationModalOpen(false);
    await postWithLocation(postPosition, locationLabel);
  };

  const selectSavedPlaceForPost = (place: SavedLocation) => {
    if (locationModalLoading) return;
    setLocationModalLoading(true);
    setLocationModalError(null);
    void touchSavedLocation
      .mutateAsync(place.saved_location_id)
      .then(() =>
        finishPostWithPlace(savedLocationPosition(place), place.location_label.trim()),
      )
      .catch((err: unknown) => {
        setLocationModalError(err instanceof Error ? err.message : 'Could not use this saved place.');
        setLocationModalLoading(false);
      });
  };

  const shareLocationForPost = () => {
    if (locationModalLoading) return;

    setLocationModalLoading(true);
    setLocationModalError(null);

    // Keep geolocation call in the same turn as the button tap so the browser shows the permission prompt.
    const positionRequest = requestPosition({ fresh: true });

    void (async () => {
      try {
        const result = await positionRequest;
        setForegroundPermission(await readForegroundPermission());

        if (!result.ok) {
          setLocationModalError(
            positionErrorMessage(result, 'Turn it on in browser settings to post this request.'),
          );
          return;
        }

        const suggestion = await suggestAreaLabel(result.position);
        const locationLabel = suggestion?.trim();
        if (!locationLabel || locationLabel.length < 2) {
          setLocationModalError(
            'We got your position but could not name the area. Try again or pick a saved place.',
          );
          return;
        }

        await finishPostWithPlace(result.position, locationLabel);

        if (saveLocationForFuture) {
          try {
            await upsertSavedLocation.mutateAsync({
              locationLabel,
              position: result.position,
            });
          } catch {
            showAppToast('Could not save this place for later.', 'warning');
          }
        }
      } catch {
        setLocationModalError('Could not get your location. Try again.');
      } finally {
        setLocationModalLoading(false);
      }
    })();
  };

  const handlePostPress = () => {
    const scheduledFor: Date | null =
      whenMode === 'now' ? null : isFutureSchedule(laterAt) ? laterAt : null;

    if (!formCoreValid) {
      if (!stepValid[0]) {
        showAppToast(`Use at least ${CREATE_TITLE_LIMITS.min} characters in the title.`, 'warning');
        return;
      }
      if (!stepValid[1]) {
        showAppToast('Describe what needs to be done to continue.', 'warning');
        return;
      }
      if (!stepValid[2]) {
        showAppToast(amountError ?? 'Enter a valid offer amount to continue.', 'warning');
        return;
      }
      if (whenMode === 'later' && scheduledFor === null) {
        setLaterTimeError(true);
        showAppToast('Choose a date and time in the future.', 'warning');
      }
      return;
    }

    if (whenMode === 'later' && scheduledFor === null) {
      setLaterTimeError(true);
      return;
    }

    const label = areaLabel.trim();
    if (position && label.length >= 2) {
      void postWithLocation(position, label);
      return;
    }

    void (async () => {
      const permission = await readForegroundPermission();
      setForegroundPermission(permission);
      if (permission === 'denied') {
        showAppToast(
          'Location access is off. Turn it on in browser settings to post this request.',
          'warning',
        );
      }
      setLocationModalError(null);
      setLocationModalOpen(true);
    })();
  };

  const posting =
    create.isPending || wallet.isPending || locationModalLoading || attachmentUploading;
  const saveDisabled = !formCoreValid || posting;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <WizardHeader
        step={step}
        stepCount={STEP_COUNT}
        onClose={onClose}
        onBack={step > 0 ? goBack : undefined}
      />
      <WizardProgress step={step} stepCount={STEP_COUNT} />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-5">
        {step === 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-3xl font-bold leading-9 text-ink">What do you need?</h2>
            <p className="text-base text-muted">Keep it short and concise.</p>
            <StepTextArea
              inputRef={titleInputRef}
              value={title}
              onChange={setTitle}
              placeholder="e.g. Fix my leaking sink, Need a ride to the airport…"
              maxLength={CREATE_TITLE_LIMITS.max}
              minHeight={120}
              textClassName="text-xl font-semibold"
            />
            {trimmedTitle.length > 0 && trimmedTitle.length < CREATE_TITLE_LIMITS.min ? (
              <p className="text-sm text-muted">At least {CREATE_TITLE_LIMITS.min} characters to continue.</p>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-3xl font-bold leading-9 text-ink">Tell us more</h2>
            <p className="text-base text-muted">What does success look like? (optional)</p>
            <StepTextArea
              inputRef={descriptionInputRef}
              value={description}
              onChange={setDescription}
              placeholder="e.g. Move my 3-seater sofa from the ground floor to the second floor…"
              maxLength={DESCRIPTION_LIMITS.max}
              minHeight={200}
              textClassName="text-lg"
            />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-3xl font-bold leading-9 text-ink">What are you offering?</h2>
            <p className="text-base text-muted">How much you&apos;re willing to pay.</p>
            <div className="rounded-2xl bg-surface px-5 py-6">
              <MoneyAmountInput
                inputRef={amountInputRef}
                accessibilityLabel="Offer amount"
                value={amount}
                onChangeText={(text) => setAmount(text.replace(/[^\d]/g, ''))}
                trailing={
                  <div className="flex flex-col items-end pl-3">
                    <span className="text-xs font-medium text-muted">Available</span>
                    {wallet.isPending ? (
                      <span className="text-sm font-semibold text-subtle">…</span>
                    ) : wallet.isError ? (
                      <span className="text-sm font-semibold text-danger">—</span>
                    ) : (
                      <span className="text-sm font-semibold text-ink">
                        {formatMoney(wallet.data?.available ?? 0, wallet.data?.currency ?? MARKET.currency)}
                      </span>
                    )}
                  </div>
                }
              />
            </div>
            {amountError ? <p className="text-sm text-warning">{amountError}</p> : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-3xl font-bold leading-9 text-ink">When do you need it?</h2>
            <p className="text-base text-muted">People nearby will see your request straight away.</p>
            <div className="flex flex-row gap-3">
              <WhenPill
                label="Now"
                selected={whenMode === 'now'}
                onPress={() => {
                  setWhenMode('now');
                  setLaterTimeError(false);
                }}
              />
              <WhenPill
                label="Later"
                selected={whenMode === 'later'}
                onPress={() => {
                  setWhenMode('later');
                  setLaterTimeError(false);
                }}
              />
            </div>
            {whenMode === 'later' ? (
              <LaterScheduleEditor
                laterAt={laterAt}
                laterTimeError={laterTimeError}
                onLaterAtChange={setLaterAt}
              />
            ) : null}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-3xl font-bold leading-9 text-ink">What kind of help?</h2>
            <p className="text-base text-muted">
              Optional. Pick up to {MAX_REQUEST_TAGS} tags so the right people see your request.
            </p>
            <RequestTagPickerAfterNavigation selected={selectedTags} onChange={setSelectedTagsSafe} />
          </div>
        ) : null}

        {step === 5 ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <h2 className="text-3xl font-bold leading-9 text-ink">Add a photo?</h2>
              <p className="text-base text-muted">
                Optional. This will help people better understand your request
              </p>
              <div className="flex flex-row gap-3">
                <PhotoSourceButton
                  icon="camera-outline"
                  label="Take photo"
                  disabled={posting}
                  onClick={() => void choosePhoto('camera')}
                />
                <PhotoSourceButton
                  icon="images-outline"
                  label="Choose gallery"
                  disabled={posting}
                  onClick={() => void choosePhoto('library')}
                />
              </div>
            </div>

            <RequestReviewBeforePostCard
              title={trimmedTitle}
              description={trimmedDescription}
              amountLabel={reviewAmount}
              whenLabel={reviewWhen}
              locationLabel={reviewLocation}
              tagSlugs={selectedTags.map((tag) => tag.name)}
              previewUri={attachmentUri}
            />

            {REQUEST_REQUIRES_FUNDING && funding ? (
              <p className="text-sm text-muted">
                {formatMoney(funding.total, funding.currency)} will be held from your wallet when you accept
                someone to help.
              </p>
            ) : null}
            {error ? <InlineError message={error} /> : null}
          </div>
        ) : null}
      </div>

      <footer className="shrink-0 bg-canvas p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {isLastStep ? (
          <WizardPrimaryButton
            label="Post request"
            loading={posting}
            disabled={saveDisabled}
            onClick={handlePostPress}
          />
        ) : (
          <WizardPrimaryButton label="Next" inactive={!stepValid[step]} onClick={goNext} />
        )}
      </footer>

      <RequestLocationModal
        open={locationModalOpen}
        onClose={() => {
          if (locationModalLoading) return;
          setLocationModalOpen(false);
          setLocationModalError(null);
        }}
        loading={locationModalLoading}
        errorMessage={locationModalError}
        locationPermissionDenied={foregroundPermission === 'denied'}
        savedPlaces={savedLocations.data ?? []}
        savedPlacesLoading={savedLocations.isPending}
        saveForFuture={saveLocationForFuture}
        onSaveForFutureChange={setSaveLocationForFuture}
        onSelectSavedPlace={selectSavedPlaceForPost}
        onShareLocation={() => void shareLocationForPost()}
      />
    </div>
  );
}
