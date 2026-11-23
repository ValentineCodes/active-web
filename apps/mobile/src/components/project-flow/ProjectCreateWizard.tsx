import { useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { addHours, set } from 'date-fns';

import {
  RequestLocationModal,
  type RequestLocationSheetHandle,
} from '@/components/RequestLocationModal';
import { ProjectReviewBeforePostCard } from '@/components/project-flow/ProjectReviewBeforePostCard';
import { ProjectTagPicker } from '@/components/project-flow/ProjectTagPicker';
import { IconButton } from '@/components/ui/IconButton';
import { KeyboardStickyFooter } from '@/components/ui/KeyboardStickyFooter';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { Screen } from '@/components/ui/Screen';
import { InlineError, LoadingState } from '@/components/ui/StateView';
import { CREATE_TITLE_LIMITS, DESCRIPTION_LIMITS } from '@/config';
import { useUserId } from '@/features/auth/session';
import {
  savedLocationPosition,
  useMySavedLocations,
  useTouchSavedLocation,
  useUpsertSavedLocation,
  type SavedLocation,
} from '@/features/profile/saved-locations-api';
import {
  useCreateProject,
  useMyEntitlements,
  useStartPremiumTrial,
} from '@/features/projects/project-api';
import {
  defaultFutureExpiryDate,
  expirySummaryLabel,
  localDateIso,
  type RequestExpiryMode,
} from '@/features/requests/request-expiry';
import {
  chooseRequestPhotoFromLibrary,
  takeRequestPhoto,
  uploadRequestPhoto,
} from '@/features/requests/request-media';
import type { RequestTag } from '@/features/requests/tags';
import { cn } from '@/lib/cn';
import {
  positionErrorMessage,
  readForegroundPermission,
  requestPosition,
  suggestAreaLabel,
  type ForegroundPermission,
  type Position,
} from '@/lib/location';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme';
import type { Database } from '@/lib/supabase/database.types';

type FundingVisibility = Database['public']['Enums']['project_funding_visibility'];

const STEP_COUNT = 7;

function createTextAreaTypography(textSize: 'base' | 'lg' | 'xl') {
  if (textSize === 'xl') return { fontSize: 20, lineHeight: 28, fontWeight: '600' as const };
  if (textSize === 'lg') return { fontSize: 18, lineHeight: 26, fontWeight: '400' as const };
  return { fontSize: 16, lineHeight: 24, fontWeight: '400' as const };
}

function WizardProgress({ step, stepCount }: { step: number; stepCount: number }) {
  const progress = ((step + 1) / stepCount) * 100;

  return (
    <View className="mx-5 h-1 overflow-hidden rounded-full bg-surface">
      <View className="h-full rounded-full bg-active" style={{ width: `${progress}%` }} />
    </View>
  );
}

function WizardHeader({
  title,
  step,
  stepCount,
  onClose,
  onBack,
}: {
  title: string;
  step: number;
  stepCount: number;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <View className="flex-row items-center gap-2 px-4 py-3">
      {onBack ? (
        <IconButton
          icon="chevron-back"
          variant="surface"
          accessibilityLabel="Go back"
          onPress={onBack}
        />
      ) : (
        <IconButton icon="close" variant="surface" accessibilityLabel="Close" onPress={onClose} />
      )}
      <Text className="flex-1 text-xl font-bold text-ink" numberOfLines={1}>
        {title}
      </Text>
      <Text className="min-w-10 text-right text-sm font-medium text-subtle">
        {step + 1} / {stepCount}
      </Text>
    </View>
  );
}

function WizardPrimaryButton({
  label,
  disabled,
  inactive,
  loading,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  inactive?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const inert = disabled || loading;
  const muted = inert || inactive;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      onPressIn={() => onPress()}
      hitSlop={8}
      className={cn(
        'min-h-12 items-center justify-center rounded-2xl px-6 py-4 active:opacity-90',
        muted ? 'bg-surface' : 'bg-active',
      )}
    >
      {loading ? (
        <ActivityIndicator color={muted ? colors.subtle : colors.onBrand} />
      ) : (
        <Text className={cn('text-lg font-bold', muted ? 'text-subtle' : 'text-on-brand')}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function CreateTextArea({
  inputRef,
  value,
  onChangeText,
  placeholder,
  maxLength,
  minHeight = 160,
  textSize = 'base',
}: {
  inputRef?: RefObject<ComponentRef<typeof TextInput> | null>;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  maxLength: number;
  minHeight?: number;
  textSize?: 'base' | 'lg' | 'xl';
}) {
  const colors = useColors();
  const typography = createTextAreaTypography(textSize);

  return (
    <TextInput
      ref={inputRef}
      accessibilityLabel={placeholder}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.subtle}
      multiline
      maxLength={maxLength}
      textAlignVertical="top"
      className="rounded-2xl bg-surface px-4 py-4 text-ink"
      style={[typography, { minHeight }]}
    />
  );
}

function PhotoSourceButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className="flex-1 items-center gap-3 rounded-2xl bg-surface px-4 py-6 active:opacity-90"
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-active/15">
        <Ionicons name={icon} size={24} color={colors.active} />
      </View>
      <Text className="text-base font-semibold text-ink">{label}</Text>
    </Pressable>
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
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'flex-1 items-center justify-center rounded-2xl py-4 active:opacity-90',
        selected ? 'bg-active' : 'bg-surface',
      )}
    >
      <Text className={cn('text-base font-bold', selected ? 'text-on-brand' : 'text-muted')}>
        {label}
      </Text>
    </Pressable>
  );
}

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

export function ProjectCreateWizard({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (projectId: string) => void;
}) {
  const userId = useUserId();
  const entitlements = useMyEntitlements();
  const startTrial = useStartPremiumTrial();
  const create = useCreateProject();
  const savedLocations = useMySavedLocations();
  const touchSavedLocation = useTouchSavedLocation();
  const upsertSavedLocation = useUpsertSavedLocation();
  const locationSheetRef = useRef<RequestLocationSheetHandle>(null);

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
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    title: null as string | null,
    description: null as string | null,
    funding: null as string | null,
  });
  const [error, setError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [areaLabel, setAreaLabel] = useState('');
  const [locationModalLoading, setLocationModalLoading] = useState(false);
  const [locationModalError, setLocationModalError] = useState<string | null>(null);
  const [foregroundPermission, setForegroundPermission] = useState<ForegroundPermission | null>(
    null,
  );
  const [saveLocationForFuture, setSaveLocationForFuture] = useState(true);

  const titleInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const budgetInputRef = useRef<ComponentRef<typeof TextInput>>(null);

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

  useEffect(() => {
    if (step > 2) return;
    const timer = setTimeout(() => {
      if (step === 0) titleInputRef.current?.focus();
      else if (step === 2) budgetInputRef.current?.focus();
    }, 120);
    return () => clearTimeout(timer);
  }, [step]);

  const clearAttachment = () => {
    setAttachmentUri(null);
    setAttachmentMimeType(null);
  };

  const pickAttachment = async (source: 'camera' | 'library') => {
    try {
      const result =
        source === 'camera' ? await takeRequestPhoto() : await chooseRequestPhotoFromLibrary();
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setAttachmentUri(asset.uri);
      setAttachmentMimeType(asset.mimeType ?? null);
    } catch (e) {
      showAppToast(e instanceof Error ? e.message : 'Could not add a photo.', 'warning');
    }
  };

  const uploadAttachmentIfNeeded = async (): Promise<string | null> => {
    if (!attachmentUri) return null;
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

  const onFundingDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'dismissed' || !date) return;
    setFundingDeadlineAt((prev) =>
      set(prev, { year: date.getFullYear(), month: date.getMonth(), date: date.getDate() }),
    );
  };

  const onFundingTimeChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (event.type === 'dismissed' || !date) return;
    setFundingDeadlineAt((prev) =>
      set(prev, {
        hours: date.getHours(),
        minutes: date.getMinutes(),
        seconds: 0,
        milliseconds: 0,
      }),
    );
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
      onSuccess(projectId);
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
        locationSheetRef.current?.dismiss();
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
      .then(() => finishCreateWithPlace(savedLocationPosition(place), place.location_label.trim()))
      .catch((err: unknown) => {
        setLocationModalError(err instanceof Error ? err.message : 'Could not use this saved place.');
        setLocationModalLoading(false);
      });
  };

  const shareLocationForCreate = async () => {
    if (locationModalLoading) return;

    const permission = await readForegroundPermission();
    setForegroundPermission(permission);
    if (permission === 'denied') {
      setLocationModalError(
        positionErrorMessage(
          { ok: false, reason: 'permission-denied' },
          'Turn it on in Settings to create this project.',
        ),
      );
      return;
    }

    setLocationModalLoading(true);
    setLocationModalError(null);

    try {
      const result = await requestPosition();
      setForegroundPermission(await readForegroundPermission());
      if (!result.ok) {
        setLocationModalError(
          positionErrorMessage(result, 'Turn it on in Settings to create this project.'),
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
      if (permission === 'denied') {
        showAppToast(
          'Location access is off. Turn it on in Settings to create this project.',
          'warning',
        );
        return;
      }
      setLocationModalError(null);
      setTimeout(() => locationSheetRef.current?.present(), 0);
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

  if (showQuerySkeleton(entitlements)) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  return (
  <>
    <Screen edges={['top', 'bottom']}>
      <KeyboardStickyFooter
        footer={
          <View className="gap-3 p-5">
            {isLastStep ? (
              <WizardPrimaryButton
                label="Create project"
                loading={posting}
                disabled={posting || !stepValid.every(Boolean)}
                onPress={handleCreatePress}
              />
            ) : (
              <WizardPrimaryButton
                label="Next"
                inactive={!stepValid[step]}
                onPress={goNext}
              />
            )}
          </View>
        }
      >
        <WizardHeader
          title="New project"
          step={step}
          stepCount={STEP_COUNT}
          onClose={onClose}
          onBack={step > 0 ? goBack : undefined}
        />
        <WizardProgress step={step} stepCount={STEP_COUNT} />

        <ScrollView
          contentContainerClassName="gap-5 p-5 pb-8"
          keyboardShouldPersistTaps="handled"
          className="flex-1"
        >
          {step === 0 ? (
            <View className="gap-3">
              <Text className="text-3xl font-bold leading-9 text-ink">What do you need?</Text>
              <Text className="text-base text-muted">Keep it short and concise.</Text>
              <CreateTextArea
                inputRef={titleInputRef}
                value={title}
                onChangeText={(value) => {
                  setTitle(value);
                  setFieldErrors((c) => ({ ...c, title: null }));
                }}
                placeholder="e.g. Community borehole, Street lighting…"
                maxLength={CREATE_TITLE_LIMITS.max}
                textSize="xl"
                minHeight={120}
              />
              {fieldErrors.title ? (
                <Text className="text-sm text-danger">{fieldErrors.title}</Text>
              ) : trimmedTitle.length > 0 && trimmedTitle.length < CREATE_TITLE_LIMITS.min ? (
                <Text className="text-sm text-muted">
                  At least {CREATE_TITLE_LIMITS.min} characters to continue.
                </Text>
              ) : null}
            </View>
          ) : null}

          {step === 1 ? (
            <View className="gap-3">
              <Text className="text-3xl font-bold leading-9 text-ink">Tell us more</Text>
              <Text className="text-base text-muted">What does success look like?</Text>
              <CreateTextArea
                value={description}
                onChangeText={(value) => {
                  setDescription(value);
                  setFieldErrors((c) => ({ ...c, description: null }));
                }}
                placeholder="Goals, who benefits, how work will be coordinated…"
                maxLength={DESCRIPTION_LIMITS.max}
                textSize="lg"
                minHeight={200}
              />
              {fieldErrors.description ? (
                <Text className="text-sm text-danger">{fieldErrors.description}</Text>
              ) : null}
            </View>
          ) : null}

          {step === 2 ? (
            <View className="gap-4">
              <Text className="text-3xl font-bold leading-9 text-ink">Funding targets</Text>
              <Text className="text-base text-muted">Set your budget and contribution limits.</Text>
              <View className="gap-2">
                <Text className="text-sm font-semibold text-ink">Total budget</Text>
                <View className="rounded-2xl bg-surface px-5 py-4">
                  <MoneyAmountInput
                    inputRef={budgetInputRef}
                    accessibilityLabel="Total budget"
                    value={budget}
                    onChangeText={(text) => {
                      setBudget(text.replace(/[^\d]/g, ''));
                      setFieldErrors((c) => ({ ...c, funding: null }));
                    }}
                  />
                </View>
              </View>
              <View className="gap-2">
                <Text className="text-sm font-semibold text-ink">Minimum funding target</Text>
                <View className="rounded-2xl bg-surface px-5 py-4">
                  <MoneyAmountInput
                    accessibilityLabel="Minimum funding target"
                    value={minTarget}
                    onChangeText={(text) => {
                      setMinTarget(text.replace(/[^\d]/g, ''));
                      setFieldErrors((c) => ({ ...c, funding: null }));
                    }}
                  />
                </View>
              </View>
              <View className="gap-2">
                <Text className="text-sm font-semibold text-ink">Minimum contribution</Text>
                <View className="rounded-2xl bg-surface px-5 py-4">
                  <MoneyAmountInput
                    accessibilityLabel="Minimum contribution"
                    value={minContribution}
                    onChangeText={(text) => {
                      setMinContribution(text.replace(/[^\d]/g, ''));
                      setFieldErrors((c) => ({ ...c, funding: null }));
                    }}
                  />
                </View>
              </View>
              {fieldErrors.funding ? (
                <Text className="text-sm text-danger">{fieldErrors.funding}</Text>
              ) : null}
            </View>
          ) : null}

          {step === 3 ? (
            <View className="gap-3">
              <Text className="text-3xl font-bold leading-9 text-ink">Funding deadline</Text>
              <Text className="text-base text-muted">When should fundraising close?</Text>
              <View className="flex-row gap-3">
                <WhenPill
                  label="Today"
                  selected={fundingMode === 'today'}
                  onPress={() => setFundingMode('today')}
                />
                <WhenPill
                  label="Future date"
                  selected={fundingMode === 'future'}
                  onPress={() => setFundingMode('future')}
                />
              </View>
              <Text className="text-sm text-muted">{deadlineLabel}</Text>
              {fundingMode === 'future' ? (
                <View className="flex-row flex-wrap gap-2">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowDatePicker(true)}
                    className="rounded-2xl bg-surface px-4 py-3 active:opacity-90"
                  >
                    <Text className="text-base font-semibold text-ink">Change date</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowTimePicker(true)}
                    className="rounded-2xl bg-surface px-4 py-3 active:opacity-90"
                  >
                    <Text className="text-base font-semibold text-ink">Change time</Text>
                  </Pressable>
                </View>
              ) : null}
              {showDatePicker ? (
                <DateTimePicker
                  value={fundingDeadlineAt}
                  mode="date"
                  minimumDate={new Date()}
                  maximumDate={addHours(new Date(), 24 * 30)}
                  onChange={onFundingDateChange}
                />
              ) : null}
              {showTimePicker ? (
                <DateTimePicker
                  value={fundingDeadlineAt}
                  mode="time"
                  onChange={onFundingTimeChange}
                />
              ) : null}
            </View>
          ) : null}

          {step === 4 ? (
            <View className="gap-3">
              <Text className="text-3xl font-bold leading-9 text-ink">Who can see funding?</Text>
              <Text className="text-base text-muted">Control who can view contribution progress.</Text>
              <View className="flex-row gap-3">
                <WhenPill
                  label="Public"
                  selected={visibility === 'public'}
                  onPress={() => setVisibility('public')}
                />
                <WhenPill
                  label="Private"
                  selected={visibility === 'invite_only'}
                  onPress={() => setVisibility('invite_only')}
                />
              </View>
              {visibility === 'invite_only' ? (
                <Text className="text-base text-muted">
                  Won&apos;t appear in the home feed. Only people you invite can contribute.
                </Text>
              ) : null}
            </View>
          ) : null}

          {step === 5 ? (
            <View className="gap-3">
              <Text className="text-3xl font-bold leading-9 text-ink">Tags</Text>
              <Text className="text-base text-muted">Help people discover your project.</Text>
              <ProjectTagPicker selected={tags} onChange={setTags} />
            </View>
          ) : null}

          {step === 6 ? (
            <View className="gap-5">
              <View className="gap-3">
                <Text className="text-3xl font-bold leading-9 text-ink">Add a photo?</Text>
                <Text className="text-base text-muted">
                  Optional. Helps collaborators understand the project.
                </Text>
                <View className="flex-row gap-3">
                  <PhotoSourceButton
                    icon="camera-outline"
                    label="Take photo"
                    disabled={posting}
                    onPress={() => void pickAttachment('camera')}
                  />
                  <PhotoSourceButton
                    icon="images-outline"
                    label="Choose gallery"
                    disabled={posting}
                    onPress={() => void pickAttachment('library')}
                  />
                </View>
              </View>

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

              {error ? <InlineError error={error} /> : null}
              {create.isError ? <InlineError error={create.error} /> : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardStickyFooter>
    </Screen>

    <RequestLocationModal
      ref={locationSheetRef}
      title="Where is this project?"
      body="Pick a saved place or share your current location. Others see a rough area until funding opens."
      loading={locationModalLoading}
      errorMessage={locationModalError}
      locationPermissionDenied={foregroundPermission === 'denied'}
      savedPlaces={savedLocations.data ?? []}
      savedPlacesLoading={savedLocations.isPending}
      saveForFuture={saveLocationForFuture}
      onSaveForFutureChange={setSaveLocationForFuture}
      onDismiss={() => {
        if (locationModalLoading) return;
        setLocationModalError(null);
      }}
      onSelectSavedPlace={selectSavedPlaceForCreate}
      onShareLocation={() => void shareLocationForCreate()}
    />
  </>
  );
}