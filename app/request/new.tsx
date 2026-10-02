import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { addHours, set, startOfTomorrow } from 'date-fns';

import {
  RequestLocationModal,
  type RequestLocationSheetHandle,
} from '@/components/RequestLocationModal';
import { Button } from '@/components/ui/Button';
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
import { useCreateRequest, useMyRequest } from '@/features/requests/requester-api';
import { cn } from '@/lib/cn';
import { formatMoney, formatWhen, formatWhenHome } from '@/lib/format';
import {
  positionErrorMessage,
  requestPosition,
  suggestAreaLabel,
  type Position,
} from '@/lib/location';
import { syncPushToken } from '@/lib/notifications';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme';

const STEP_COUNT = 4;

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

function WizardProgress({ step }: { step: number }) {
  const progress = ((step + 1) / STEP_COUNT) * 100;

  return (
    <View className="mx-5 h-1 overflow-hidden rounded-full bg-surface">
      <View className="h-full rounded-full bg-active" style={{ width: `${progress}%` }} />
    </View>
  );
}

function WizardHeader({
  title,
  step,
  onClose,
  onBack,
}: {
  title: string;
  step: number;
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
        {step + 1} / {STEP_COUNT}
      </Text>
    </View>
  );
}

function WizardSkipButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Skip"
      onPress={onPress}
      className="items-center justify-center rounded-2xl bg-surface px-7 py-4 active:opacity-90"
    >
      <Text className="text-base font-semibold text-muted">Skip</Text>
    </Pressable>
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

function CreateTextArea({
  inputRef,
  value,
  onChangeText,
  placeholder,
  maxLength,
  minHeight = 160,
  textSize = 'base',
}: {
  inputRef?: RefObject<TextInputType | null>;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  maxLength: number;
  minHeight?: number;
  textSize?: 'base' | 'lg' | 'xl';
}) {
  const colors = useColors();
  const textSizeClass =
    textSize === 'xl'
      ? 'text-xl leading-8'
      : textSize === 'lg'
        ? 'text-lg leading-7'
        : 'text-base leading-6';

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
      className={cn('rounded-2xl bg-surface px-4 py-4 text-ink', textSizeClass)}
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

function NewRequestForm({ reuseSeed }: { reuseSeed?: ReuseSeed }) {
  const colors = useColors();
  const seeded = newRequestFormState(reuseSeed);
  const create = useCreateRequest();
  const wallet = useMyWallet();
  const { refetch: refetchWallet } = wallet;

  useFocusEffect(
    useCallback(() => {
      void refetchWallet();
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
  const locationSheetRef = useRef<RequestLocationSheetHandle>(null);

  const titleInputRef = useRef<TextInputType>(null);
  const descriptionInputRef = useRef<TextInputType>(null);
  const amountInputRef = useRef<TextInputType>(null);

  const reusingPrior = Boolean(reuseSeed);
  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const parsedAmount = amount.trim() ? Number(amount.replace(/[^\d.]/g, '')) : null;

  const amountError =
    parsedAmount !== null && (Number.isNaN(parsedAmount) || parsedAmount < 0)
      ? 'Enter a valid amount.'
      : null;

  const stepValid = [
    trimmedTitle.length >= CREATE_TITLE_LIMITS.min &&
      trimmedTitle.length <= CREATE_TITLE_LIMITS.max,
    true,
    REQUEST_REQUIRES_FUNDING ? isFundedOffer(parsedAmount) && !amountError : amountError === null,
    whenMode === 'now' || isFutureSchedule(laterAt),
  ];

  const isLastStep = step === STEP_COUNT - 1;
  const funding = isFundedOffer(parsedAmount) ? summarizeRequestFunding(parsedAmount) : null;
  const walletShort =
    REQUEST_REQUIRES_FUNDING &&
    funding !== null &&
    wallet.data !== undefined &&
    wallet.data.available < funding.total;

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
    setLaterTimeError(false);
    setStep((current) => Math.min(current + 1, STEP_COUNT - 1));
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

  const submit = (postPosition: Position, locationLabel: string) => {
    const scheduledFor: Date | null =
      whenMode === 'now' ? null : isFutureSchedule(laterAt) ? laterAt : null;

    if (
      trimmedTitle.length < CREATE_TITLE_LIMITS.min ||
      (REQUEST_REQUIRES_FUNDING && !isFundedOffer(parsedAmount)) ||
      (whenMode === 'later' && scheduledFor === null)
    ) {
      if (whenMode === 'later' && scheduledFor === null) setLaterTimeError(true);
      else showAppToast('Check the details on earlier steps and try again.', 'warning');
      return;
    }

    create.mutate(
      {
        title: trimmedTitle,
        description: trimmedDescription || null,
        position: postPosition,
        locationLabel,
        scheduledFor,
        offeredAmount: parsedAmount!,
        sourceRequestId: reusingPrior ? reuseSeed?.sourceRequestId : undefined,
      },
      {
        onSuccess: (requestId) => {
          syncPushToken({ mode: 'contextual' });
          showAppToast('Request posted');
          if (parsedAmount !== null) {
            const funding = summarizeRequestFunding(parsedAmount);
            showAppToast(`${formatMoney(funding.total, funding.currency)} locked`, 'info');
          }
          router.replace(`/request/${requestId}`);
        },
      },
    );
  };

  const handlePostPress = () => {
    const scheduledFor: Date | null =
      whenMode === 'now' ? null : isFutureSchedule(laterAt) ? laterAt : null;

    if (whenMode === 'later' && scheduledFor === null) {
      setLaterTimeError(true);
      return;
    }

    const label = areaLabel.trim();
    if (position && label.length >= 2) {
      submit(position, label);
      return;
    }

    setLocationModalError(null);
    InteractionManager.runAfterInteractions(() => {
      locationSheetRef.current?.present();
    });
  };

  const shareLocationForPost = async () => {
    setLocationModalLoading(true);
    setLocationModalError(null);

    const result = await requestPosition();
    if (!result.ok) {
      setLocationModalError(
        positionErrorMessage(result, 'Turn it on in Settings to post this request.'),
      );
      setLocationModalLoading(false);
      return;
    }

    const suggestion = await suggestAreaLabel(result.position);
    const locationLabel = suggestion?.trim() || 'My location';
    setPosition(result.position);
    setAreaLabel(locationLabel);

    setLocationModalLoading(false);
    locationSheetRef.current?.dismiss();
    submit(result.position, locationLabel);
  };

  const closeWizard = () => router.back();
  const goBack = () => setStep((current) => Math.max(current - 1, 0));

  const reviewWhen = whenMode === 'now' ? 'Today' : formatWhen(laterAt.toISOString());
  const reviewLocation = areaLabel.trim() || 'My location';

  return (
    <BottomSheetModalProvider>
      <Screen edges={['top', 'bottom']}>
        <KeyboardStickyFooter
          footer={
            <View className="gap-3 border-t border-hairline p-5">
              {step === 1 ? (
                <View className="flex-row items-stretch gap-3">
                  <WizardSkipButton onPress={goNext} />
                  <WizardPrimaryButton label="Next" onPress={goNext} className="flex-1" />
                </View>
              ) : isLastStep ? (
                <WizardPrimaryButton
                  label="Post request"
                  loading={create.isPending || wallet.isPending || locationModalLoading}
                  disabled={!stepValid[step] || walletShort}
                  onPress={handlePostPress}
                />
              ) : (
                <WizardPrimaryButton label="Next" disabled={!stepValid[step]} onPress={goNext} />
              )}
            </View>
          }
        >
          <WizardHeader
            title={reusingPrior ? 'Send request again' : 'New request'}
            step={step}
            onClose={closeWizard}
            onBack={step > 0 ? goBack : undefined}
          />
          <WizardProgress step={step} />

          <ScrollView
            contentContainerClassName="gap-5 p-5 pb-8"
            keyboardShouldPersistTaps="handled"
            className="flex-1"
          >
            {step === 0 ? (
              <View className="gap-3">
                <Text className="font-serif text-3xl font-bold leading-9 text-ink">
                  What do you need?
                </Text>
                <Text className="text-base text-muted">Describe it in your own words.</Text>
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
                <Text className="font-serif text-3xl font-bold leading-9 text-ink">
                  Tell us more
                </Text>
                <Text className="text-base text-muted">
                  Optional. Any detail that helps people understand what&apos;s needed.
                </Text>
                <CreateTextArea
                  inputRef={descriptionInputRef}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Any extra context, requirements, or things to know…"
                  maxLength={DESCRIPTION_LIMITS.max}
                  textSize="lg"
                  minHeight={200}
                />
              </View>
            ) : null}

            {step === 2 ? (
              <View className="gap-3">
                <Text className="font-serif text-3xl font-bold leading-9 text-ink">
                  What are you offering?
                </Text>
                <Text className="text-base text-muted">How much you&apos;re willing to pay.</Text>
                <View className="rounded-2xl bg-surface px-5 py-6">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-3xl font-bold text-active">₦</Text>
                    <TextInput
                      ref={amountInputRef}
                      accessibilityLabel="Offer amount"
                      value={amount}
                      onChangeText={(text) => setAmount(text.replace(/[^\d]/g, ''))}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.subtle}
                      className="flex-1 py-0 text-3xl font-bold text-ink"
                      maxLength={9}
                    />
                  </View>
                </View>
                {amountError ? <Text className="text-sm text-warning">{amountError}</Text> : null}
              </View>
            ) : null}

            {step === 3 ? (
              <View className="gap-5">
                <View className="gap-3">
                  <Text className="font-serif text-3xl font-bold leading-9 text-ink">
                    When do you need it?
                  </Text>
                  <Text className="text-base text-muted">
                    People nearby will see your request straight away.
                  </Text>
                  <View className="flex-row gap-3">
                    <WhenPill
                      label="Right Now"
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

                <View className="gap-3 rounded-2xl border border-hairline bg-elevated p-4">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
                    Review before posting
                  </Text>
                  <Text className="font-serif text-xl font-bold text-ink" numberOfLines={1}>
                    {trimmedTitle}
                  </Text>
                  {trimmedDescription ? (
                    <Text className="text-sm leading-5 text-muted" numberOfLines={2}>
                      {trimmedDescription}
                    </Text>
                  ) : null}
                  <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1 pt-1">
                    {isFundedOffer(parsedAmount) ? (
                      <Text className="text-base font-bold text-active">
                        {formatMoney(parsedAmount, MARKET.currency)}
                      </Text>
                    ) : null}
                    <Text className="text-sm text-muted">·</Text>
                    <Text className="text-sm text-muted">{whenSummary(whenMode, laterAt)}</Text>
                    <Text className="text-sm text-muted">·</Text>
                    <Text className="text-sm text-muted">{reviewLocation}</Text>
                  </View>
                </View>

                {REQUEST_REQUIRES_FUNDING && funding ? (
                  <View className="gap-2">
                    {wallet.isPending ? (
                      <Text className="text-sm text-muted">Checking wallet…</Text>
                    ) : wallet.isError ? (
                      <InlineError error={wallet.error} />
                    ) : wallet.data ? (
                      <Text className="text-sm text-muted">
                        {walletShort
                          ? `You need ${formatMoney(funding.total, funding.currency)} available (including fee). Top up before posting.`
                          : `${formatMoney(funding.total, funding.currency)} will be held from your wallet when this goes live.`}
                      </Text>
                    ) : null}
                    {walletShort ? (
                      <Button
                        label="Top up wallet"
                        variant="secondary"
                        onPress={() => router.push('/wallet')}
                      />
                    ) : null}
                  </View>
                ) : null}

                {create.isError ? <InlineError error={create.error} /> : null}
              </View>
            ) : null}
          </ScrollView>
        </KeyboardStickyFooter>
      </Screen>

      <RequestLocationModal
        ref={locationSheetRef}
        loading={locationModalLoading}
        errorMessage={locationModalError}
        onDismiss={() => setLocationModalError(null)}
        onShareLocation={() => void shareLocationForPost()}
      />
    </BottomSheetModalProvider>
  );
}

export default function NewRequestScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const sourceRequestId = typeof from === 'string' ? from : undefined;
  const sourceRequest = useMyRequest(sourceRequestId ?? '');

  if (sourceRequestId && sourceRequest.isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState />
      </Screen>
    );
  }

  if (sourceRequestId && sourceRequest.isError) {
    return (
      <Screen edges={['top', 'bottom']}>
        <WizardHeader title="New request" step={0} onClose={() => router.back()} />
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
      <Screen edges={['top', 'bottom']}>
        <WizardHeader title="New request" step={0} onClose={() => router.back()} />
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
