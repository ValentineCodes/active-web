import { useCallback, useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { addHours, set, startOfTomorrow } from 'date-fns';

import {
  RequestLocationModal,
  type RequestLocationSheetHandle,
} from '@/components/RequestLocationModal';
import { Button } from '@/components/ui/Button';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { IconButton } from '@/components/ui/IconButton';
import { KeyboardStickyFooter } from '@/components/ui/KeyboardStickyFooter';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import {
  CREATE_TITLE_LIMITS,
  DESCRIPTION_LIMITS,
  MARKET,
  REQUEST_REQUIRES_FUNDING,
} from '@/config';
import { isFundedOffer, summarizeRequestFunding } from '@/features/requests/funding';
import { useMyWallet } from '@/features/wallet/api';
import { canReuseRequest } from '@/features/requests/reuse';
import { useUserId } from '@/features/auth/session';
import {
  chooseRequestPhotoFromLibrary,
  takeRequestPhoto,
  uploadRequestPhoto,
} from '@/features/requests/request-media';
import { RequestEditLockedState } from '@/components/request-flow/RequestEditLockedState';
import { RequestReviewBeforePostCard } from '@/components/request-flow/RequestReviewBeforePostCard';
import { RequestTagPickerAfterNavigation } from '@/components/request-flow/RequestTagPicker';
import {
  MAX_REQUEST_TAGS,
  resolveRequestTagsFromApiLabels,
  useTagCatalogue,
  type RequestTag,
} from '@/features/requests/tags';
import { isRequestEditable } from '@/features/requests/edit-eligibility';
import {
  isRequestEditLockedError,
  showRequestEditLockedToast,
} from '@/features/requests/request-edit-locked';
import { useRequestAttachmentUrl } from '@/features/requests/request-attachment-url';
import {
  useCreateRequest,
  useLiveRequest,
  useMyRequest,
  useUpdateRequest,
} from '@/features/requests/requester-api';
import { cn } from '@/lib/cn';
import { formatMoney, formatWhenHome } from '@/lib/format';
import {
  savedLocationPosition,
  type SavedLocation,
  useMySavedLocations,
  useTouchSavedLocation,
  useUpsertSavedLocation,
} from '@/features/profile/saved-locations-api';
import {
  positionErrorMessage,
  readForegroundPermission,
  requestPosition,
  suggestAreaLabel,
  type ForegroundPermission,
  type Position,
} from '@/lib/location';
import { syncPushToken } from '@/lib/notifications';
import { showAppToast } from '@/lib/toast';
import { poppinsInputTypography, type PoppinsInputSize } from '@/theme/fonts';
import { useColors } from '@/theme';

function createTextAreaTypography(textSize: 'base' | 'lg' | 'xl') {
  const size: PoppinsInputSize = textSize === 'xl' ? 'xl' : textSize === 'lg' ? 'lg' : 'base';
  return poppinsInputTypography('regular', size, { multiline: true });
}

const STEP_COUNT = 6;

type WhenMode = 'now' | 'later';

type ReuseSeed = {
  sourceRequestId: string;
  title: string;
  description: string | null;
  offeredAmount: number;
  latitude: number;
  longitude: number;
  locationLabel: string;
};

function defaultLaterAt() {
  return set(startOfTomorrow(), { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 });
}

function newRequestFormState(reuse?: ReuseSeed) {
  if (!reuse) {
    return {
      title: '',
      description: '',
      whenMode: 'now' as WhenMode,
      laterAt: defaultLaterAt(),
      amount: '',
      position: null as Position | null,
      areaLabel: '',
    };
  }

  return {
    title: reuse.title,
    description: reuse.description ?? '',
    whenMode: 'now' as WhenMode,
    laterAt: defaultLaterAt(),
    amount: String(reuse.offeredAmount),
    position: { latitude: reuse.latitude, longitude: reuse.longitude },
    areaLabel: reuse.locationLabel,
  };
}

function isFutureSchedule(at: Date) {
  return at.getTime() > Date.now();
}

function whenSummary(mode: WhenMode, laterAt: Date): string {
  if (mode === 'now') return 'Today';
  return formatWhenHome(laterAt.toISOString());
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
  fireOnPressIn,
  className,
}: {
  label: string;
  disabled?: boolean;
  /** Grey styling while still accepting presses (validation feedback in onPress). */
  inactive?: boolean;
  loading?: boolean;
  onPress: () => void;
  /** Use touch-down so Next works when the keyboard is open (footer is outside the ScrollView). */
  fireOnPressIn?: boolean;
  className?: string;
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
      onPress={fireOnPressIn ? undefined : onPress}
      onPressIn={fireOnPressIn ? () => onPress() : undefined}
      hitSlop={8}
      className={cn(
        'min-h-12 items-center justify-center rounded-2xl px-6 py-4 active:opacity-90',
        muted ? 'bg-surface' : 'bg-active',
        className,
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

export function NewRequestForm({
  reuseSeed,
  editRequestId,
}: {
  reuseSeed?: ReuseSeed;
  editRequestId?: string;
}) {
  const userId = useUserId();
  const isEdit = Boolean(editRequestId);
  const editRequest = useMyRequest(editRequestId ?? '');
  const seeded = newRequestFormState(reuseSeed);
  const create = useCreateRequest();
  const update = useUpdateRequest(editRequestId ?? '');
  useLiveRequest(editRequestId ?? '');
  const wallet = useMyWallet();
  const { refetch: refetchWallet } = wallet;
  const tagCatalogue = useTagCatalogue();
  const [foregroundPermission, setForegroundPermission] =
    useState<ForegroundPermission>('undetermined');

  useFocusEffect(
    useCallback(() => {
      void refetchWallet();
      void readForegroundPermission().then(setForegroundPermission);
    }, [refetchWallet]),
  );

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(seeded.title);
  const [description, setDescription] = useState(seeded.description);
  const [whenMode, setWhenMode] = useState<WhenMode>(seeded.whenMode);
  const [laterAt, setLaterAt] = useState(seeded.laterAt);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [amount, setAmount] = useState(seeded.amount);
  const [position, setPosition] = useState<Position | null>(seeded.position);
  const [areaLabel, setAreaLabel] = useState(seeded.areaLabel);
  const [laterTimeError, setLaterTimeError] = useState(false);
  const [locationModalLoading, setLocationModalLoading] = useState(false);
  const [locationModalError, setLocationModalError] = useState<string | null>(null);
  const [saveLocationForFuture, setSaveLocationForFuture] = useState(true);
  const savedLocations = useMySavedLocations();
  const touchSavedLocation = useTouchSavedLocation();
  const upsertSavedLocation = useUpsertSavedLocation();
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [attachmentMimeType, setAttachmentMimeType] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<RequestTag[]>([]);
  const [editFormSeeded, setEditFormSeeded] = useState(false);
  const setSelectedTagsSafe = (next: RequestTag[]) => {
    setSelectedTags(next.slice(0, MAX_REQUEST_TAGS));
  };
  const locationSheetRef = useRef<RequestLocationSheetHandle>(null);

  const titleInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const descriptionInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const amountInputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const reusingPrior = Boolean(reuseSeed) && !isEdit;
  const stepCount = STEP_COUNT;
  const savedAttachmentUrl = useRequestAttachmentUrl(
    isEdit && !attachmentUri ? editRequest.data?.attachment_path : null,
  );
  const reviewPreviewUri = attachmentUri ?? savedAttachmentUrl.data ?? null;

  const editStillAllowed =
    !isEdit ||
    !editRequest.data ||
    isRequestEditable({
      status: editRequest.data.status,
      expires_at: editRequest.data.expires_at,
      accepted_at: editRequest.data.accepted_at,
      pending_response_count: editRequest.data.pending_response_count,
      is_editable: editRequest.data.is_editable,
    });

  const exitEditToRequestDetail = () => {
    router.back();
  };

  const rejectEditBecauseLocked = () => {
    showRequestEditLockedToast();
    exitEditToRequestDetail();
  };

  useEffect(() => {
    if (!isEdit || !editRequest.data || editFormSeeded) return;

    const row = editRequest.data;
    setTitle(row.title);
    setDescription(row.description ?? '');
    if (row.scheduled_for) {
      setWhenMode('later');
      setLaterAt(new Date(row.scheduled_for));
    } else {
      setWhenMode('now');
    }
    if (row.offered_amount != null) {
      setAmount(String(row.offered_amount));
    }
    setPosition({ latitude: row.latitude, longitude: row.longitude });
    setAreaLabel(row.location_label);

    setEditFormSeeded(true);
  }, [isEdit, editRequest.data, editFormSeeded]);

  useEffect(() => {
    if (!isEdit || !editRequest.data?.tag_slugs?.length || !tagCatalogue.data?.length) return;
    const tags = resolveRequestTagsFromApiLabels(editRequest.data.tag_slugs, tagCatalogue.data);
    if (tags.length > 0) {
      setSelectedTagsSafe(tags);
    }
  }, [isEdit, editRequest.data?.tag_slugs, tagCatalogue.data]);

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const parsedAmount = amount.trim() ? Number(amount.replace(/[^\d.]/g, '')) : null;

  const amountError =
    parsedAmount !== null && (Number.isNaN(parsedAmount) || parsedAmount < 0)
      ? 'Enter a valid amount.'
      : null;

  const descriptionValid = trimmedDescription.length <= DESCRIPTION_LIMITS.max;

  const stepValid = [
    trimmedTitle.length >= CREATE_TITLE_LIMITS.min &&
      trimmedTitle.length <= CREATE_TITLE_LIMITS.max,
    descriptionValid,
    REQUEST_REQUIRES_FUNDING ? isFundedOffer(parsedAmount) && !amountError : amountError === null,
    whenMode === 'now' || isFutureSchedule(laterAt),
    true,
    true,
  ];

  const formCoreValid = stepValid[0] && stepValid[1] && stepValid[2] && stepValid[3];

  const isLastStep = step === stepCount - 1;
  const funding = isFundedOffer(parsedAmount) ? summarizeRequestFunding(parsedAmount) : null;

  useEffect(() => {
    if (step > 2) return;

    const focusTimer = setTimeout(() => {
      if (step === 0) titleInputRef.current?.focus();
      else if (step === 1) descriptionInputRef.current?.focus();
      else if (step === 2) amountInputRef.current?.focus();
    }, 50);

    return () => clearTimeout(focusTimer);
  }, [step]);

  const goNext = () => {
    if (step === STEP_COUNT - 1) return;

    titleInputRef.current?.blur();
    descriptionInputRef.current?.blur();
    amountInputRef.current?.blur();
    Keyboard.dismiss();

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
    setStep((current) => Math.min(current + 1, stepCount - 1));
  };

  const onLaterDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'dismissed' || !date) return;
    setLaterAt((prev) =>
      set(prev, { year: date.getFullYear(), month: date.getMonth(), date: date.getDate() }),
    );
  };

  const onLaterTimeChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (event.type === 'dismissed' || !date) return;
    setLaterAt((prev) =>
      set(prev, {
        hours: date.getHours(),
        minutes: date.getMinutes(),
        seconds: 0,
        milliseconds: 0,
      }),
    );
  };

  const submit = (postPosition: Position, locationLabel: string, attachmentPath: string | null) => {
    const attachmentForRpc: string | null | undefined =
      attachmentPath ?? (isEdit ? undefined : null);
    const scheduledFor: Date | null =
      whenMode === 'now' ? null : isFutureSchedule(laterAt) ? laterAt : null;

    if (
      trimmedTitle.length < CREATE_TITLE_LIMITS.min ||
      !descriptionValid ||
      (REQUEST_REQUIRES_FUNDING && !isFundedOffer(parsedAmount)) ||
      (whenMode === 'later' && scheduledFor === null)
    ) {
      if (whenMode === 'later' && scheduledFor === null) setLaterTimeError(true);
      else showAppToast('Check the details on earlier steps and try again.', 'warning');
      return;
    }

    const payload = {
      title: trimmedTitle,
      description: trimmedDescription,
      position: postPosition,
      locationLabel,
      scheduledFor,
      offeredAmount: parsedAmount!,
      attachmentPath: attachmentForRpc,
      tags: selectedTags.slice(0, MAX_REQUEST_TAGS).map((tag) => ({ slug: tag.slug })),
    };

    if (isEdit && editRequestId) {
      if (update.isPending) return;
      if (!editStillAllowed) {
        rejectEditBecauseLocked();
        return;
      }
      update.mutate(payload, {
        onSuccess: () => {
          showAppToast('Your changes were saved', { type: 'success', title: 'Request updated' });
          router.back();
        },
        onError: (error) => {
          if (isRequestEditLockedError(error)) {
            rejectEditBecauseLocked();
          }
        },
      });
      return;
    }

    create.mutate(
      {
        ...payload,
        sourceRequestId: reusingPrior ? reuseSeed?.sourceRequestId : undefined,
      },
      {
        onSuccess: (requestId) => {
          syncPushToken({ mode: 'contextual' });
          const funding =
            parsedAmount !== null && isFundedOffer(parsedAmount)
              ? summarizeRequestFunding(parsedAmount)
              : null;
          showAppToast('Your request is live', { type: 'success', title: 'Request posted' });
          router.replace(`/request/${requestId}`);
        },
      },
    );
  };

  const uploadAttachmentIfNeeded = async (): Promise<string | null> => {
    if (!attachmentUri) return null;
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
    try {
      const attachmentPath = await uploadAttachmentIfNeeded();
      submit(postPosition, locationLabel, attachmentPath);
    } catch (error) {
      showAppToast(
        error instanceof Error ? error.message : 'Could not upload the photo. Try again.',
        'warning',
      );
    }
  };

  const handleSaveEdit = async () => {
    if (update.isPending) return;
    if (!editStillAllowed) {
      rejectEditBecauseLocked();
      return;
    }

    const scheduledFor: Date | null =
      whenMode === 'now' ? null : isFutureSchedule(laterAt) ? laterAt : null;

    if (!formCoreValid || !position) {
      if (!stepValid[1]) {
        showAppToast('Describe what needs to be done to continue.', 'warning');
      } else {
        showAppToast('Check the details on earlier steps and try again.', 'warning');
      }
      return;
    }

    if (whenMode === 'later' && scheduledFor === null) {
      setLaterTimeError(true);
      showAppToast('Choose a date and time in the future.', 'warning');
      return;
    }

    const locationLabel =
      areaLabel.trim() || editRequest.data?.location_label.trim() || 'My location';

    try {
      const attachmentPath = await uploadAttachmentIfNeeded();
      submit(position, locationLabel, attachmentPath);
    } catch (error) {
      showAppToast(
        error instanceof Error ? error.message : 'Could not upload the photo. Try again.',
        'warning',
      );
    }
  };

  const handlePostPress = () => {
    if (isEdit) {
      void handleSaveEdit();
      return;
    }

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
        showAppToast('Location access is off. Turn it on in Settings to post this request.', 'warning');
        return;
      }

      setLocationModalError(null);
      setTimeout(() => {
        locationSheetRef.current?.present();
      }, 0);
    })();
  };

  const finishPostWithPlace = async (postPosition: Position, locationLabel: string) => {
    setPosition(postPosition);
    setAreaLabel(locationLabel);
    setLocationModalLoading(false);
    locationSheetRef.current?.dismiss();
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
      .catch((error: unknown) => {
        setLocationModalError(
          error instanceof Error ? error.message : 'Could not use this saved place.',
        );
        setLocationModalLoading(false);
      });
  };

  const shareLocationForPost = async () => {
    if (locationModalLoading) return;

    const permission = await readForegroundPermission();
    setForegroundPermission(permission);
    if (permission === 'denied') {
      setLocationModalError(
        positionErrorMessage(
          { ok: false, reason: 'permission-denied' },
          'Turn it on in Settings to post this request.',
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
          positionErrorMessage(result, 'Turn it on in Settings to post this request.'),
        );
        return;
      }

      const suggestion = await suggestAreaLabel(result.position);
      const locationLabel = suggestion?.trim() || 'My location';

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
  };

  const pickAttachment = async (source: 'camera' | 'library') => {
    try {
      const result =
        source === 'camera' ? await takeRequestPhoto() : await chooseRequestPhotoFromLibrary();
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setAttachmentUri(asset.uri);
      setAttachmentMimeType(asset.mimeType ?? null);
    } catch (error) {
      showAppToast(error instanceof Error ? error.message : 'Could not add a photo.', 'warning');
    }
  };

  const closeWizard = () => router.back();
  const goBack = () => setStep((current) => Math.max(current - 1, 0));

  const reviewWhen = whenSummary(whenMode, laterAt);
  const reviewLocation = areaLabel.trim() || 'My location';
  const reviewAmount = isFundedOffer(parsedAmount)
    ? formatMoney(parsedAmount, MARKET.currency)
    : null;
  const posting =
    create.isPending ||
    update.isPending ||
    wallet.isPending ||
    locationModalLoading ||
    attachmentUploading;

  if (isEdit && editRequest.isPending) {
    return (
      <Screen edges={['top']}>
        <LoadingState />
      </Screen>
    );
  }

  if (isEdit && editRequest.isError) {
    return (
      <Screen edges={['top']}>
        <WizardHeader
          title="Edit Request"
          step={0}
          stepCount={stepCount}
          onClose={() => router.back()}
        />
        <ErrorState error={editRequest.error} onRetry={() => editRequest.refetch()} />
      </Screen>
    );
  }

  if (isEdit && editRequest.isSuccess && !editStillAllowed) {
    return (
      <Screen edges={['top']}>
        <WizardHeader
          title="Edit Request"
          step={0}
          stepCount={stepCount}
          onClose={exitEditToRequestDetail}
        />
        <RequestEditLockedState onBack={exitEditToRequestDetail} />
      </Screen>
    );
  }

  const wizardTitle = isEdit ? 'Edit Request' : reusingPrior ? 'Send request again' : 'New request';
  const postLabel = isEdit ? 'Save changes' : 'Post request';
  const saveDisabled = !formCoreValid || posting || (isEdit && !editStillAllowed);

  return (
    <>
      <Screen edges={['top', 'bottom']}>
        <KeyboardStickyFooter
          footer={
            <View className="gap-3 p-5">
              {isLastStep ? (
                <WizardPrimaryButton
                  label={postLabel}
                  loading={posting}
                  disabled={saveDisabled}
                  onPress={handlePostPress}
                />
              ) : (
                <WizardPrimaryButton
                  label="Next"
                  inactive={!stepValid[step]}
                  fireOnPressIn
                  onPress={goNext}
                />
              )}
            </View>
          }
        >
          <WizardHeader
            title={wizardTitle}
            step={step}
            stepCount={stepCount}
            onClose={closeWizard}
            onBack={step > 0 ? goBack : undefined}
          />
          <WizardProgress step={step} stepCount={stepCount} />

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
                  onChangeText={setTitle}
                  placeholder="e.g. Fix my leaking sink, Need a ride to the airport…"
                  maxLength={CREATE_TITLE_LIMITS.max}
                  textSize="xl"
                  minHeight={120}
                />
                {trimmedTitle.length > 0 && trimmedTitle.length < CREATE_TITLE_LIMITS.min ? (
                  <Text className="text-sm text-muted">
                    At least {CREATE_TITLE_LIMITS.min} characters to continue.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {step === 1 ? (
              <View className="gap-3">
                <Text className="text-3xl font-bold leading-9 text-ink">Tell us more</Text>
                <Text className="text-base text-muted">What does success look like? (optional)</Text>
                <CreateTextArea
                  inputRef={descriptionInputRef}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. Move my 3-seater sofa from the ground floor to the second floor, All remote buttons must work as new, ..."
                  maxLength={DESCRIPTION_LIMITS.max}
                  textSize="lg"
                  minHeight={200}
                />
                {trimmedDescription.length > DESCRIPTION_LIMITS.max ? (
                  <Text className="text-sm text-warning">
                    Keep the description under {DESCRIPTION_LIMITS.max} characters.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {step === 2 ? (
              <View className="gap-3">
                <Text className="text-3xl font-bold leading-9 text-ink">
                  What are you offering?
                </Text>
                <Text className="text-base text-muted">How much you&apos;re willing to pay.</Text>
                <View className="rounded-2xl bg-surface px-5 py-6">
                  <MoneyAmountInput
                    inputRef={amountInputRef}
                    accessibilityLabel="Offer amount"
                    value={amount}
                    onChangeText={(text) => setAmount(text.replace(/[^\d]/g, ''))}
                    trailing={
                      <View className="items-end pl-3">
                        <Text className="text-xs font-medium text-muted">Available</Text>
                        {wallet.isPending ? (
                          <Text className="text-sm font-semibold text-subtle">…</Text>
                        ) : wallet.isError ? (
                          <Text className="text-sm font-semibold text-danger">—</Text>
                        ) : (
                          <Text className="text-sm font-semibold text-ink">
                            {formatMoney(
                              wallet.data?.available ?? 0,
                              wallet.data?.currency ?? MARKET.currency,
                            )}
                          </Text>
                        )}
                      </View>
                    }
                  />
                </View>
                {amountError ? <Text className="text-sm text-warning">{amountError}</Text> : null}
              </View>
            ) : null}

            {step === 3 ? (
              <View className="gap-3">
                <Text className="text-3xl font-bold leading-9 text-ink">When do you need it?</Text>
                <Text className="text-base text-muted">
                  People nearby will see your request straight away.
                </Text>
                <View className="flex-row gap-3">
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
                </View>
                {whenMode === 'later' ? (
                  <View className="gap-3 rounded-2xl bg-surface p-4">
                    <Text className="text-base font-semibold text-ink">{reviewWhen}</Text>
                    {laterTimeError ? (
                      <Text className="text-sm text-warning">Choose a time in the future.</Text>
                    ) : null}
                    {Platform.OS === 'ios' ? (
                      <DateTimePicker
                        value={laterAt}
                        mode="datetime"
                        minimumDate={new Date()}
                        maximumDate={addHours(new Date(), 24 * 30)}
                        onChange={(_, date) => {
                          if (date) setLaterAt(date);
                        }}
                      />
                    ) : (
                      <View className="flex-row flex-wrap gap-2">
                        <Button
                          label="Change date"
                          variant="secondary"
                          onPress={() => setShowDatePicker(true)}
                        />
                        <Button
                          label="Change time"
                          variant="secondary"
                          onPress={() => setShowTimePicker(true)}
                        />
                      </View>
                    )}
                    {showDatePicker ? (
                      <DateTimePicker
                        value={laterAt}
                        mode="date"
                        minimumDate={new Date()}
                        maximumDate={addHours(new Date(), 24 * 30)}
                        onChange={onLaterDateChange}
                      />
                    ) : null}
                    {showTimePicker ? (
                      <DateTimePicker value={laterAt} mode="time" onChange={onLaterTimeChange} />
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            {step === 4 ? (
              <View className="gap-3">
                <Text className="text-3xl font-bold leading-9 text-ink">What kind of help?</Text>
                <Text className="text-base text-muted">
                  Optional. Pick up to {MAX_REQUEST_TAGS} tags so the right people see your request.
                </Text>
                <RequestTagPickerAfterNavigation
                  selected={selectedTags}
                  onChange={setSelectedTagsSafe}
                />
              </View>
            ) : null}

            {step === 5 ? (
              <View className="gap-5">
                <View className="gap-3">
                  <Text className="text-3xl font-bold leading-9 text-ink">Add a photo?</Text>
                  <Text className="text-base text-muted">
                    Optional. This will help people better understand your request
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

                <RequestReviewBeforePostCard
                  title={trimmedTitle}
                  description={trimmedDescription}
                  amountLabel={reviewAmount}
                  whenLabel={reviewWhen}
                  locationLabel={reviewLocation}
                  tagSlugs={selectedTags.map((tag) => tag.name)}
                  previewUri={reviewPreviewUri}
                  reviewHeading={isEdit ? 'Review your changes' : 'Review before posting'}
                />

                {REQUEST_REQUIRES_FUNDING && funding ? (
                  <Text className="text-sm text-muted">
                    {formatMoney(funding.total, funding.currency)} will be held from your wallet when
                    you accept someone to help.
                  </Text>
                ) : null}

                {create.isError ? <InlineError error={create.error} /> : null}
                {update.isError ? <InlineError error={update.error} /> : null}
              </View>
            ) : null}
          </ScrollView>
        </KeyboardStickyFooter>
      </Screen>

      <RequestLocationModal
        ref={locationSheetRef}
        loading={locationModalLoading}
        errorMessage={locationModalError}
        locationPermissionDenied={foregroundPermission === 'denied'}
        savedPlaces={savedLocations.data ?? []}
        savedPlacesLoading={savedLocations.isPending}
        saveForFuture={saveLocationForFuture}
        onSaveForFutureChange={setSaveLocationForFuture}
        onDismiss={() => setLocationModalError(null)}
        onSelectSavedPlace={selectSavedPlaceForPost}
        onShareLocation={() => void shareLocationForPost()}
      />
    </>
  );
}

export default function NewRequestScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const sourceRequestId = typeof from === 'string' ? from : undefined;
  const sourceRequest = useMyRequest(sourceRequestId ?? '');

  if (sourceRequestId && sourceRequest.isPending) {
    return (
      <Screen edges={['top']}>
        <LoadingState />
      </Screen>
    );
  }

  if (sourceRequestId && sourceRequest.isError) {
    return (
      <Screen edges={['top']}>
        <WizardHeader
          title="New request"
          step={0}
          stepCount={STEP_COUNT}
          onClose={() => router.back()}
        />
        <ErrorState error={sourceRequest.error} onRetry={() => sourceRequest.refetch()} />
      </Screen>
    );
  }

  if (
    sourceRequestId &&
    sourceRequest.isSuccess &&
    !canReuseRequest(sourceRequest.data.status, sourceRequest.data.expires_at)
  ) {
    return (
      <Screen edges={['top']}>
        <WizardHeader
          title="New request"
          step={0}
          stepCount={STEP_COUNT}
          onClose={() => router.back()}
        />
        <ErrorState
          error={
            new Error(
              'This request cannot be sent again. Only finished or expired requests can be reused.',
            )
          }
          onRetry={() => router.back()}
        />
      </Screen>
    );
  }

  const reuseSeed: ReuseSeed | undefined =
    sourceRequestId && sourceRequest.data && sourceRequest.data.offered_amount != null
      ? {
          sourceRequestId,
          title: sourceRequest.data.title,
          description: sourceRequest.data.description,
          offeredAmount: sourceRequest.data.offered_amount,
          latitude: sourceRequest.data.latitude,
          longitude: sourceRequest.data.longitude,
          locationLabel: sourceRequest.data.location_label,
        }
      : undefined;

  return <NewRequestForm key={reuseSeed?.sourceRequestId ?? 'new'} reuseSeed={reuseSeed} />;
}
