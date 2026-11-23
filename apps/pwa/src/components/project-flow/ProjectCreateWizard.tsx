'use client';

import { set } from 'date-fns';
import { useRef, useState } from 'react';

import {
  isLocalAttachmentUri,
  PhotoSourceButton,
  StepFieldError,
  StepTextArea,
  useWizardStepFocus,
  WizardHeader,
  WizardProgress,
  WizardWhenPill,
} from '@/components/create-flow/wizard-chrome';
import { RequestLocationModal } from '@/components/RequestLocationModal';
import { KeyboardStickyFooter } from '@/components/layout/KeyboardStickyFooter';
import {
  savedLocationPosition,
  useMySavedLocations,
  useTouchSavedLocation,
  useUpsertSavedLocation,
  type SavedLocation,
} from '@/features/profile/saved-locations-api';
import {
  positionErrorMessage,
  readForegroundPermission,
  requestPosition,
  suggestAreaLabel,
  type ForegroundPermission,
  type Position,
} from '@/lib/geolocation';
import { ProjectReviewBeforePostCard } from '@/components/project-flow/ProjectReviewBeforePostCard';
import { ProjectTagPicker } from '@/components/project-flow/ProjectTagPicker';
import { ActiveBarButton } from '@/components/ui/ActiveBarButton';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { Screen } from '@/components/ui/Screen';
import { InlineError, LoadingState } from '@/components/ui/StateView';
import { CREATE_TITLE_LIMITS, DESCRIPTION_LIMITS, MARKET } from '@/config';
import {
  defaultFutureExpiryDate,
  expirySummaryLabel,
  localDateIso,
  type RequestExpiryMode,
} from '@/features/requests/request-expiry-core';
import {
  chooseRequestPhotoFromLibrary,
  takeRequestPhoto,
  uploadRequestPhoto,
} from '@/features/requests/request-media';
import type { RequestTag } from '@/features/requests/tags';
import {
  useCreateProject,
  useMyEntitlements,
  useStartPremiumTrial,
} from '@/features/projects/project-api';
import { useUserId } from '@/features/auth/use-user-id';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';
import type { Database } from '@/lib/supabase/database.types';
type FundingVisibility = Database['public']['Enums']['project_funding_visibility'];

const STEP_COUNT = 7;

function titleValidationMessage(title: string): string | null {
  const trimmed = title.trim();
  if (trimmed.length > CREATE_TITLE_LIMITS.max) {
    return `Keep the title under ${CREATE_TITLE_LIMITS.max} characters.`;
  }
  if (trimmed.length < CREATE_TITLE_LIMITS.min) {
    return `Use at least ${CREATE_TITLE_LIMITS.min} characters in the title.`;
  }
  return null;
}

function descriptionValidationMessage(description: string): string | null {
  if (description.length > DESCRIPTION_LIMITS.max) {
    return `Keep the description under ${DESCRIPTION_LIMITS.max} characters.`;
  }
  return null;
}

function parseMajor(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/[^\d.]/g, ''));
  return Number.isNaN(parsed) ? null : parsed;
}

function fundingValidationMessage(
  budget: string,
  minTarget: string,
  minContribution: string,
): string | null {
  const b = parseMajor(budget);
  const t = parseMajor(minTarget);
  const c = parseMajor(minContribution);
  if (b === null || t === null || c === null) {
    return 'Enter budget, minimum funding target, and minimum contribution.';
  }
  if (b <= 0 || t <= 0 || c <= 0) {
    return 'Amounts must be greater than zero.';
  }
  if (t > b) return 'Minimum target cannot exceed total budget.';
  if (c > t) return 'Minimum contribution cannot exceed minimum target.';
  return null;
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ProjectCreateWizard({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (href: string) => void;
}) {
  const userId = useUserId();
  const entitlements = useMyEntitlements();
  const startTrial = useStartPremiumTrial();
  const create = useCreateProject();
  const savedLocations = useMySavedLocations();
  const touchSavedLocation = useTouchSavedLocation();
  const upsertSavedLocation = useUpsertSavedLocation();

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [minTarget, setMinTarget] = useState('');
  const [minContribution, setMinContribution] = useState('');
  const [fundingMode, setFundingMode] = useState<RequestExpiryMode>('today');
  const [fundingDeadlineAt, setFundingDeadlineAt] = useState(defaultFutureExpiryDate());
  const [visibility, setVisibility] = useState<FundingVisibility>('public');
  const [tags, setTags] = useState<RequestTag[]>([]);
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [attachmentMimeType, setAttachmentMimeType] = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    title: null as string | null,
    description: null as string | null,
    funding: null as string | null,
  });
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [areaLabel, setAreaLabel] = useState('');
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationModalLoading, setLocationModalLoading] = useState(false);
  const [locationModalError, setLocationModalError] = useState<string | null>(null);
  const [foregroundPermission, setForegroundPermission] = useState<ForegroundPermission>('undetermined');
  const [saveLocationForFuture, setSaveLocationForFuture] = useState(true);

  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const budgetInputRef = useRef<HTMLInputElement>(null);

  useWizardStepFocus(step, 0, titleInputRef);
  useWizardStepFocus(step, 2, budgetInputRef, 120);

  const trimmedTitle = title.trim();
  const parsedBudget = parseMajor(budget);
  const parsedMinTarget = parseMajor(minTarget);
  const parsedMinContribution = parseMajor(minContribution);

  const stepValid = [
    trimmedTitle.length >= CREATE_TITLE_LIMITS.min && trimmedTitle.length <= CREATE_TITLE_LIMITS.max,
    description.length <= DESCRIPTION_LIMITS.max,
    fundingValidationMessage(budget, minTarget, minContribution) === null,
    fundingMode === 'today' || fundingDeadlineAt.getTime() > Date.now(),
    true,
    true,
    true,
  ];

  const isLastStep = step === STEP_COUNT - 1;
  const canCreate = entitlements.data?.can_create_projects ?? false;
  const effectiveFundingDeadline =
    fundingMode === 'today' ? defaultFutureExpiryDate() : fundingDeadlineAt;

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const goNext = () => {
    if (isLastStep) return;
    if (step === 0) {
      const message = titleValidationMessage(title);
      if (message) {
        setFieldErrors((c) => ({ ...c, title: message }));
        return;
      }
      setFieldErrors((c) => ({ ...c, title: null }));
    }
    if (step === 1) {
      const message = descriptionValidationMessage(description);
      if (message) {
        setFieldErrors((c) => ({ ...c, description: message }));
        return;
      }
      setFieldErrors((c) => ({ ...c, description: null }));
    }
    if (step === 2) {
      const message = fundingValidationMessage(budget, minTarget, minContribution);
      if (message) {
        setFieldErrors((c) => ({ ...c, funding: message }));
        return;
      }
      setFieldErrors((c) => ({ ...c, funding: null }));
    }
    setStep((s) => Math.min(s + 1, STEP_COUNT - 1));
  };

  const clearAttachment = () => {
    if (attachmentUri && isLocalAttachmentUri(attachmentUri)) URL.revokeObjectURL(attachmentUri);
    setAttachmentUri(null);
    setAttachmentMimeType(null);
    setAttachmentFile(null);
  };

  const choosePhoto = async (source: 'camera' | 'library') => {
    try {
      const asset = source === 'camera' ? await takeRequestPhoto() : await chooseRequestPhotoFromLibrary();
      if (!asset) return;
      if (attachmentUri && isLocalAttachmentUri(attachmentUri)) URL.revokeObjectURL(attachmentUri);
      setAttachmentUri(asset.uri);
      setAttachmentMimeType(asset.mimeType ?? null);
      setAttachmentFile(asset.file ?? null);
    } catch (e) {
      showAppToast(e instanceof Error ? e.message : 'Could not add a photo.', 'warning');
    }
  };

  const uploadAttachmentIfNeeded = async (): Promise<string | null> => {
    if (!attachmentUri || !isLocalAttachmentUri(attachmentUri)) return null;
    if (!userId) throw new Error('Sign in to create a project.');
    setAttachmentUploading(true);
    try {
      return await uploadRequestPhoto(userId, {
        uri: attachmentUri,
        mimeType: attachmentMimeType,
        file: attachmentFile ?? undefined,
      });
    } finally {
      setAttachmentUploading(false);
    }
  };

  const ensurePremium = async () => {
    if (canCreate) return true;
    try {
      await startTrial.mutateAsync();
      return true;
    } catch (err) {
      showAppToast(
        err instanceof Error ? err.message : 'Premium is required to create collaborative projects.',
        'warning',
      );
      return false;
    }
  };

  const submitProject = async (_postPosition: Position, locationLabel: string): Promise<boolean> => {
    const fundingMessage = fundingValidationMessage(budget, minTarget, minContribution);
    if (fundingMessage || parsedBudget === null || parsedMinTarget === null || parsedMinContribution === null) {
      setFieldErrors((c) => ({ ...c, funding: fundingMessage }));
      setStep(2);
      setLocationModalError('Check your funding amounts and try again.');
      return false;
    }

    if (!(await ensurePremium())) {
      setLocationModalError('Premium trial is required to create collaborative projects.');
      return false;
    }

    setError(null);
    setPosition(_postPosition);
    setAreaLabel(locationLabel);
    const fundingDate = effectiveFundingDeadline;

    try {
      const attachmentPath = await uploadAttachmentIfNeeded();
      const projectId = await create.mutateAsync({
        title: trimmedTitle,
        description,
        budgetTotalMajor: parsedBudget,
        minFundingTargetMajor: parsedMinTarget,
        minContributionMajor: parsedMinContribution,
        fundingDeadlineDate: new Date(`${localDateIso(fundingDate)}T12:00:00`),
        fundingDeadlineTime: fundingMode === 'future' ? fundingDeadlineAt : null,
        fundingVisibility: visibility,
        tags,
        attachmentPath,
        latitude: _postPosition.latitude,
        longitude: _postPosition.longitude,
        locationLabel,
      });
      showAppToast('Project published', { type: 'success', title: 'Live' });
      onSuccess(`/project/${projectId}`);
      return true;
    } catch (e) {
      const message = toUserMessage(e);
      setError(message);
      setLocationModalError(message);
      return false;
    }
  };

  const finishCreateWithPlace = async (postPosition: Position, locationLabel: string): Promise<boolean> => {
    try {
      const created = await submitProject(postPosition, locationLabel);
      if (created) {
        setLocationModalOpen(false);
        setLocationModalError(null);
      }
      return created;
    } finally {
      setLocationModalLoading(false);
    }
  };

  const selectSavedPlaceForCreate = (place: SavedLocation) => {
    if (locationModalLoading) return;
    setLocationModalLoading(true);
    setLocationModalError(null);
    void touchSavedLocation
      .mutateAsync(place.saved_location_id)
      .then(() =>
        finishCreateWithPlace(savedLocationPosition(place), place.location_label.trim()),
      )
      .catch((err: unknown) => {
        setLocationModalError(err instanceof Error ? err.message : 'Could not use this saved place.');
        setLocationModalLoading(false);
      });
  };

  const shareLocationForCreate = () => {
    if (locationModalLoading) return;
    setLocationModalLoading(true);
    setLocationModalError(null);
    const positionRequest = requestPosition({ fresh: true });
    void (async () => {
      try {
        const result = await positionRequest;
        setForegroundPermission(await readForegroundPermission());
        if (!result.ok) {
          setLocationModalError(
            positionErrorMessage(result, 'Turn it on in browser settings to create this project.'),
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
        const created = await finishCreateWithPlace(result.position, locationLabel);
        if (created && saveLocationForFuture) {
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

  const handleCreatePress = () => {
    const fundingMessage = fundingValidationMessage(budget, minTarget, minContribution);
    if (fundingMessage || parsedBudget === null || parsedMinTarget === null || parsedMinContribution === null) {
      setFieldErrors((c) => ({ ...c, funding: fundingMessage }));
      setStep(2);
      return;
    }

    const label = areaLabel.trim();
    if (position && label.length >= 2) {
      void submitProject(position, label);
      return;
    }

    void (async () => {
      const permission = await readForegroundPermission();
      setForegroundPermission(permission);
      setLocationModalError(null);
      setLocationModalOpen(true);
    })();
  };

  const posting =
    create.isPending || startTrial.isPending || attachmentUploading || locationModalLoading;
  const visibilityLabel = visibility === 'invite_only' ? 'Private' : 'Public';
  const deadlineLabel = expirySummaryLabel(
    fundingMode === 'today' ? 'future' : fundingMode,
    effectiveFundingDeadline,
  );
  const reviewLocation = areaLabel.trim() || 'Selected when you create';

  const wizardFooter = (
    <div className="px-6 pb-8">
      {isLastStep ? (
        <ActiveBarButton
          label="Create project"
          loading={posting}
          disabled={posting || !stepValid.every(Boolean)}
          onClick={handleCreatePress}
        />
      ) : (
        <ActiveBarButton label="Next" disabled={!stepValid[step]} onClick={goNext} />
      )}
    </div>
  );

  if (showQuerySkeleton(entitlements)) {
    return (
      <Screen className="h-full min-h-[100dvh]">
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen className="h-full min-h-[100dvh]">
      <KeyboardStickyFooter className="min-h-0 flex-1" footer={wizardFooter}>
        <WizardHeader
          title="New project"
          step={step}
          stepCount={STEP_COUNT}
          onClose={onClose}
          onBack={step > 0 ? goBack : undefined}
        />
        <WizardProgress step={step} stepCount={STEP_COUNT} />

        <div className="flex flex-col gap-5 px-5 pb-8 pt-5">
          {step === 0 ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-3xl font-bold leading-9 text-ink">What do you need?</h2>
              <p className="text-base text-muted">Keep it short and concise.</p>
              <StepTextArea
                inputRef={titleInputRef}
                autoFocus
                value={title}
                onChange={(value) => {
                  setTitle(value);
                  setFieldErrors((c) => ({ ...c, title: null }));
                }}
                placeholder="e.g. Community borehole, Street lighting…"
                maxLength={CREATE_TITLE_LIMITS.max}
                minHeight={120}
                textClassName="text-xl font-semibold"
              />
              {fieldErrors.title ? (
                <StepFieldError message={fieldErrors.title} />
              ) : trimmedTitle.length > 0 && trimmedTitle.length < CREATE_TITLE_LIMITS.min ? (
                <p className="text-sm text-muted">
                  At least {CREATE_TITLE_LIMITS.min} characters to continue.
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-3xl font-bold leading-9 text-ink">Tell us more</h2>
              <p className="text-base text-muted">What does success look like?</p>
              <StepTextArea
                value={description}
                onChange={(value) => {
                  setDescription(value);
                  setFieldErrors((c) => ({ ...c, description: null }));
                }}
                placeholder="Goals, who benefits, how work will be coordinated…"
                maxLength={DESCRIPTION_LIMITS.max}
                minHeight={200}
                textClassName="text-lg"
              />
              {fieldErrors.description ? <StepFieldError message={fieldErrors.description} /> : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col gap-4">
              <h2 className="text-3xl font-bold leading-9 text-ink">Funding targets</h2>
              <p className="text-base text-muted">Set your budget and contribution limits.</p>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-ink">Total budget</p>
                <div className="rounded-2xl bg-surface px-5 py-4">
                  <MoneyAmountInput
                    inputRef={budgetInputRef}
                    autoFocus
                    accessibilityLabel="Total budget"
                    value={budget}
                    onChangeText={(text) => {
                      setBudget(text.replace(/[^\d]/g, ''));
                      setFieldErrors((c) => ({ ...c, funding: null }));
                    }}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-ink">Minimum funding target</p>
                <div className="rounded-2xl bg-surface px-5 py-4">
                  <MoneyAmountInput
                    accessibilityLabel="Minimum funding target"
                    value={minTarget}
                    onChangeText={(text) => {
                      setMinTarget(text.replace(/[^\d]/g, ''));
                      setFieldErrors((c) => ({ ...c, funding: null }));
                    }}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-ink">Minimum contribution</p>
                <div className="rounded-2xl bg-surface px-5 py-4">
                  <MoneyAmountInput
                    accessibilityLabel="Minimum contribution"
                    value={minContribution}
                    onChangeText={(text) => {
                      setMinContribution(text.replace(/[^\d]/g, ''));
                      setFieldErrors((c) => ({ ...c, funding: null }));
                    }}
                  />
                </div>
              </div>
              {fieldErrors.funding ? <StepFieldError message={fieldErrors.funding} /> : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-3xl font-bold leading-9 text-ink">Funding deadline</h2>
              <p className="text-base text-muted">When should fundraising close?</p>
              <div className="flex flex-row gap-3">
                <WizardWhenPill
                  label="Today"
                  selected={fundingMode === 'today'}
                  onClick={() => setFundingMode('today')}
                />
                <WizardWhenPill
                  label="Future date"
                  selected={fundingMode === 'future'}
                  onClick={() => setFundingMode('future')}
                />
              </div>
              <p className="text-sm text-muted">{deadlineLabel}</p>
              {fundingMode === 'future' ? (
                <input
                  type="datetime-local"
                  value={toDatetimeLocalValue(fundingDeadlineAt)}
                  onChange={(event) => {
                    const next = new Date(event.target.value);
                    if (!Number.isNaN(next.getTime())) {
                      setFundingDeadlineAt((prev) =>
                        set(prev, {
                          year: next.getFullYear(),
                          month: next.getMonth(),
                          date: next.getDate(),
                          hours: next.getHours(),
                          minutes: next.getMinutes(),
                        }),
                      );
                    }
                  }}
                  className="rounded-xl border border-hairline bg-surface px-4 py-3 text-base text-ink"
                />
              ) : null}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-3xl font-bold leading-9 text-ink">Who can see funding?</h2>
              <p className="text-base text-muted">Control who can view contribution progress.</p>
              <div className="flex flex-row gap-3">
                <WizardWhenPill
                  label="Public"
                  selected={visibility === 'public'}
                  onClick={() => setVisibility('public')}
                />
                <WizardWhenPill
                  label="Private"
                  selected={visibility === 'invite_only'}
                  onClick={() => setVisibility('invite_only')}
                />
              </div>
              {visibility === 'invite_only' ? (
                <p className="text-base text-muted">
                  Won&apos;t appear in the home feed. Only people you invite can contribute.
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 5 ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-3xl font-bold leading-9 text-ink">Tags</h2>
              <p className="text-base text-muted">Help people discover your project.</p>
              <ProjectTagPicker selected={tags} onChange={setTags} />
            </div>
          ) : null}

          {step === 6 ? (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <h2 className="text-3xl font-bold leading-9 text-ink">Add a photo?</h2>
                <p className="text-base text-muted">Optional. Helps collaborators understand the project.</p>
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

              {parsedBudget !== null && parsedMinTarget !== null && parsedMinContribution !== null ? (
                <ProjectReviewBeforePostCard
                  title={trimmedTitle}
                  description={description.trim()}
                  budgetMajor={parsedBudget}
                  minTargetMajor={parsedMinTarget}
                  minContributionMajor={parsedMinContribution}
                  deadlineLabel={deadlineLabel}
                  visibilityLabel={visibilityLabel}
                  locationLabel={reviewLocation}
                  tagNames={tags.map((t) => t.name)}
                  previewUri={attachmentUri}
                  onRemovePhoto={clearAttachment}
                  removePhotoDisabled={posting}
                />
              ) : null}

              {error ? <InlineError message={error} /> : null}
              {create.isError ? <InlineError error={create.error} /> : null}
            </div>
          ) : null}
        </div>
      </KeyboardStickyFooter>

      <RequestLocationModal
        nested={false}
        open={locationModalOpen}
        title="Where is this project?"
        body="Pick a saved place or share your current location. Others see a rough area until funding opens."
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
        onSelectSavedPlace={selectSavedPlaceForCreate}
        onShareLocation={() => void shareLocationForCreate()}
      />
    </Screen>
  );
}