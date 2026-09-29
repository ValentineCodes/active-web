import { useCallback, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { addHours, set, startOfTomorrow } from 'date-fns';

import { LocationStep } from '@/components/LocationStep';
import { RequestFundingSummary } from '@/components/RequestFundingSummary';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Choice } from '@/components/ui/Choice';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { TextField } from '@/components/ui/TextField';
import { DESCRIPTION_LIMITS, MARKET, REQUEST_REQUIRES_FUNDING, TITLE_LIMITS } from '@/config';
import { isFundedOffer, summarizeRequestFunding } from '@/features/requests/funding';
import { useMyWallet } from '@/features/wallet/api';
import { canReuseRequest } from '@/features/requests/reuse';
import { useCreateRequest, useMyRequest } from '@/features/requests/requester-api';
import { cn } from '@/lib/cn';
import { formatMoney, formatWhen } from '@/lib/format';
import type { Position } from '@/lib/location';
import { syncPushToken } from '@/lib/notifications';

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
  if (mode === 'now') return 'Now';
  return formatWhen(laterAt.toISOString());
}

function NewRequestForm({ reuseSeed }: { reuseSeed?: ReuseSeed }) {
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

  const reusingPrior = Boolean(reuseSeed);
  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const parsedAmount = amount.trim() ? Number(amount.replace(/[^\d.]/g, '')) : null;

  const amountError =
    parsedAmount !== null && (Number.isNaN(parsedAmount) || parsedAmount < 0)
      ? 'Enter a valid amount.'
      : REQUEST_REQUIRES_FUNDING && !isFundedOffer(parsedAmount)
        ? 'Enter what you are offering so your request can go live.'
        : null;

  const stepValid = [
    trimmedTitle.length >= TITLE_LIMITS.min,
    true,
    REQUEST_REQUIRES_FUNDING ? isFundedOffer(parsedAmount) && !amountError : amountError === null,
    whenMode === 'now' || whenMode === 'later',
    Boolean(position) && areaLabel.trim().length >= 2,
    trimmedTitle.length >= TITLE_LIMITS.min &&
      (REQUEST_REQUIRES_FUNDING ? isFundedOffer(parsedAmount) : true) &&
      Boolean(position),
  ];

  const isFirstStep = step === 0;
  const isLastStep = step === STEP_COUNT - 1;
  const funding = isFundedOffer(parsedAmount) ? summarizeRequestFunding(parsedAmount) : null;
  const walletShort =
    REQUEST_REQUIRES_FUNDING &&
    funding !== null &&
    wallet.data !== undefined &&
    wallet.data.available < funding.total;

  const goNext = () => {
    if (step === 3 && whenMode === 'later' && !isFutureSchedule(laterAt)) {
      setLaterTimeError(true);
      return;
    }
    setLaterTimeError(false);
    setStep((current) => Math.min(current + 1, STEP_COUNT - 1));
  };
  const goBack = () => setStep((current) => Math.max(current - 1, 0));

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

  const submit = () => {
    const scheduledFor: Date | null =
      whenMode === 'now' ? null : isFutureSchedule(laterAt) ? laterAt : null;

    if (
      !position ||
      trimmedTitle.length < TITLE_LIMITS.min ||
      (REQUEST_REQUIRES_FUNDING && !isFundedOffer(parsedAmount)) ||
      (whenMode === 'later' && scheduledFor === null)
    ) {
      return;
    }

    create.mutate(
      {
        title: trimmedTitle,
        description: trimmedDescription || null,
        position,
        locationLabel: areaLabel.trim(),
        scheduledFor,
        offeredAmount: parsedAmount!,
        sourceRequestId: reusingPrior ? reuseSeed?.sourceRequestId : undefined,
      },
      {
        onSuccess: (requestId) => {
          syncPushToken({ prompt: true });
          router.replace(`/request/${requestId}`);
        },
      },
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header
        title={reusingPrior ? 'Send request again' : 'New request'}
        onBack={isFirstStep ? () => router.back() : goBack}
      />

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
          <View className="gap-4">
            <Text className="text-2xl font-bold text-ink">What do you need?</Text>
            <Text className="text-base text-muted">
              A short title so people know what you need.
            </Text>
            <TextField
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="Help me move a sofa"
              maxLength={TITLE_LIMITS.max}
              counterMax={TITLE_LIMITS.max}
              hint={
                trimmedTitle.length < TITLE_LIMITS.min
                  ? `At least ${TITLE_LIMITS.min} characters.`
                  : undefined
              }
            />
          </View>
        ) : null}

        {step === 1 ? (
          <View className="gap-4">
            <Text className="text-2xl font-bold text-ink">Tell us more</Text>
            <Text className="text-base text-muted">Optional — skip if the title says enough.</Text>
            <TextField
              label="Details"
              value={description}
              onChangeText={setDescription}
              placeholder="It's a 3-seater sofa. I need help moving it from downstairs to the second floor."
              multiline
              numberOfLines={6}
              maxLength={DESCRIPTION_LIMITS.max}
              counterMax={DESCRIPTION_LIMITS.max}
            />
          </View>
        ) : null}

        {step === 2 ? (
          <View className="gap-4">
            <Text className="text-2xl font-bold text-ink">What are you offering?</Text>
            <Text className="text-base text-muted">
              Held in your wallet while the request is open ({MARKET.currency}).
            </Text>
            <TextField
              label={`Amount (${MARKET.currency})`}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="5000"
              error={amountError}
            />
          </View>
        ) : null}

        {step === 3 ? (
          <View className="gap-4">
            <Text className="text-2xl font-bold text-ink">When do you need it?</Text>
            <Choice
              title="Now"
              subtitle="As soon as someone can help"
              selected={whenMode === 'now'}
              onPress={() => {
                setWhenMode('now');
                setLaterTimeError(false);
              }}
            />
            <Choice
              title="Later"
              subtitle="Pick a date and time"
              selected={whenMode === 'later'}
              onPress={() => {
                setWhenMode('later');
                setLaterTimeError(false);
              }}
            />
            {whenMode === 'later' ? (
              <View className="gap-3 rounded-2xl bg-surface p-4">
                <Text className="text-base font-semibold text-ink">
                  {whenSummary('later', laterAt)}
                </Text>
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
          <View className="gap-4">
            <Text className="text-2xl font-bold text-ink">Where?</Text>
            <Text className="text-base text-muted">
              Use where you are or search for another place. Exact location stays private until you
              select someone.
            </Text>
            <LocationStep
              position={position}
              onPositionChange={setPosition}
              areaLabel={areaLabel}
              onAreaLabelChange={setAreaLabel}
            />
          </View>
        ) : null}

        {step === 5 ? (
          <View className="gap-4">
            <Text className="text-2xl font-bold text-ink">Review & post</Text>

            <Card className="gap-3">
              <View className="gap-1">
                <Text className="text-xs font-semibold uppercase text-subtle">Title</Text>
                <Text className="text-lg font-bold text-ink">{trimmedTitle}</Text>
              </View>
              {trimmedDescription ? (
                <View className="gap-1">
                  <Text className="text-xs font-semibold uppercase text-subtle">Details</Text>
                  <Text className="text-base text-muted">{trimmedDescription}</Text>
                </View>
              ) : null}
              <View className="gap-1">
                <Text className="text-xs font-semibold uppercase text-subtle">Offer</Text>
                <Text className="text-base font-semibold text-ink">
                  {isFundedOffer(parsedAmount)
                    ? formatMoney(parsedAmount, MARKET.currency)
                    : 'Not set'}
                </Text>
              </View>
              <View className="gap-1">
                <Text className="text-xs font-semibold uppercase text-subtle">When</Text>
                <Text className="text-base text-ink">{whenSummary(whenMode, laterAt)}</Text>
              </View>
              <View className="gap-1">
                <Text className="text-xs font-semibold uppercase text-subtle">Location</Text>
                <Text className="text-base text-ink">{areaLabel.trim() || '—'}</Text>
              </View>
              {isFundedOffer(parsedAmount) ? (
                <RequestFundingSummary offeredAmount={parsedAmount} />
              ) : null}
            </Card>

            {REQUEST_REQUIRES_FUNDING && funding ? (
              <Card className="gap-2">
                <Text className="text-sm font-semibold text-ink">Your wallet</Text>
                {wallet.isPending ? (
                  <Text className="text-sm text-muted">Checking balance…</Text>
                ) : wallet.isError ? (
                  <InlineError error={wallet.error} />
                ) : wallet.data ? (
                  <>
                    <Text className="text-sm text-muted">
                      Available:{' '}
                      {wallet.isFetching
                        ? '…'
                        : formatMoney(wallet.data.available, wallet.data.currency)}
                    </Text>
                    {walletShort ? (
                      <Text className="text-sm text-warning">
                        You need {formatMoney(funding.total, funding.currency)} to fund this request
                        (including the fee). Top up before posting.
                      </Text>
                    ) : (
                      <Text className="text-sm text-muted">
                        {formatMoney(funding.total, funding.currency)} will be held when your
                        request goes live.
                      </Text>
                    )}
                  </>
                ) : null}
                {walletShort ? (
                  <Button
                    label="Top up wallet"
                    variant="secondary"
                    onPress={() => router.push('/wallet')}
                  />
                ) : null}
              </Card>
            ) : null}

            {create.isError ? <InlineError error={create.error} /> : null}
          </View>
        ) : null}
      </ScrollView>

      <View className="gap-3 border-t border-hairline p-5">
        {isLastStep ? (
          <Button
            label="Post request"
            size="lg"
            loading={create.isPending || wallet.isPending}
            disabled={!stepValid[step] || walletShort}
            onPress={submit}
          />
        ) : (
          <Button label="Continue" size="lg" disabled={!stepValid[step]} onPress={goNext} />
        )}
      </View>
    </Screen>
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
        <Header title="New request" onBack={() => router.back()} />
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
        <Header title="New request" onBack={() => router.back()} />
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
