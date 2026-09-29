import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { addHours, format, set, startOfTomorrow } from 'date-fns';

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
import { formatMoney } from '@/lib/format';
import type { Position } from '@/lib/location';
import { syncPushToken } from '@/lib/notifications';

function whenOptions() {
  const now = new Date();

  return [
    { key: 'asap', label: 'As soon as possible', at: null },
    { key: '1h', label: 'In about an hour', at: addHours(now, 1) },
    { key: '3h', label: 'In about three hours', at: addHours(now, 3) },
    {
      key: 'tomorrow',
      label: `Tomorrow morning (${format(set(startOfTomorrow(), { hours: 9 }), 'EEE HH:mm')})`,
      at: set(startOfTomorrow(), { hours: 9 }),
    },
  ] as const;
}

const STEP_TITLES = ['What', 'When', 'Offer', 'Where', 'Review'];

type ReuseSeed = {
  sourceRequestId: string;
  title: string;
  description: string | null;
  offeredAmount: number;
  latitude: number;
  longitude: number;
  locationLabel: string;
};

function newRequestFormState(reuse?: ReuseSeed) {
  if (!reuse) {
    return {
      title: '',
      description: '',
      whenKey: 'asap',
      amount: '',
      position: null as Position | null,
      areaLabel: '',
    };
  }

  return {
    title: reuse.title,
    description: reuse.description ?? '',
    whenKey: 'asap',
    amount: String(reuse.offeredAmount),
    position: { latitude: reuse.latitude, longitude: reuse.longitude },
    areaLabel: reuse.locationLabel,
  };
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
  const [whenKey, setWhenKey] = useState(seeded.whenKey);
  const [amount, setAmount] = useState(seeded.amount);
  const [position, setPosition] = useState<Position | null>(seeded.position);
  const [areaLabel, setAreaLabel] = useState(seeded.areaLabel);

  const reusingPrior = Boolean(reuseSeed);
  const when = whenOptions();
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
    Boolean(position) && areaLabel.trim().length >= 2,
    trimmedTitle.length >= TITLE_LIMITS.min &&
      (REQUEST_REQUIRES_FUNDING ? isFundedOffer(parsedAmount) : true) &&
      Boolean(position),
  ];

  const selectedWhen = when.find((option) => option.key === whenKey);
  const isFirstStep = step === 0;
  const isLastStep = step === STEP_TITLES.length - 1;
  const funding = isFundedOffer(parsedAmount) ? summarizeRequestFunding(parsedAmount) : null;
  const walletShort =
    REQUEST_REQUIRES_FUNDING &&
    funding !== null &&
    wallet.data !== undefined &&
    wallet.data.available < funding.total;

  const goNext = () => setStep((current) => Math.min(current + 1, STEP_TITLES.length - 1));
  const goBack = () => setStep((current) => Math.max(current - 1, 0));

  const submit = () => {
    if (
      !position ||
      trimmedTitle.length < TITLE_LIMITS.min ||
      (REQUEST_REQUIRES_FUNDING && !isFundedOffer(parsedAmount))
    ) {
      return;
    }

    create.mutate(
      {
        title: trimmedTitle,
        description: trimmedDescription || null,
        position,
        locationLabel: areaLabel.trim(),
        scheduledFor: selectedWhen?.at ?? null,
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
        title={reusingPrior ? 'Send request again' : 'Make a request'}
        onBack={isFirstStep ? () => router.back() : goBack}
      />

      <View className="flex-row gap-1.5 px-5 pb-2">
        {STEP_TITLES.map((titleLabel, index) => (
          <View
            key={titleLabel}
            className={cn('h-1.5 flex-1 rounded-full', index <= step ? 'bg-brand' : 'bg-surface')}
          />
        ))}
      </View>

      <ScrollView contentContainerClassName="gap-6 p-5 pb-12" keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <View className="gap-6">
            <Text className="text-2xl font-bold text-ink">What do you need?</Text>
            <TextField
              label="Short title"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Generator won't start"
              maxLength={TITLE_LIMITS.max}
              counterMax={TITLE_LIMITS.max}
              hint={
                trimmedTitle.length < TITLE_LIMITS.min
                  ? `At least ${TITLE_LIMITS.min} characters.`
                  : undefined
              }
            />
            <TextField
              label="Details (optional)"
              value={description}
              onChangeText={setDescription}
              placeholder="Anything helpful — model, access, timing constraints…"
              multiline
              numberOfLines={5}
              maxLength={DESCRIPTION_LIMITS.max}
              counterMax={DESCRIPTION_LIMITS.max}
            />
          </View>
        ) : null}

        {step === 1 ? (
          <View className="gap-3">
            <Text className="text-2xl font-bold text-ink">When do you need this?</Text>
            {when.map((option) => (
              <Choice
                key={option.key}
                title={option.label}
                selected={whenKey === option.key}
                onPress={() => setWhenKey(option.key)}
              />
            ))}
          </View>
        ) : null}

        {step === 2 ? (
          <View className="gap-3">
            <Text className="text-2xl font-bold text-ink">What are you offering?</Text>
            <Text className="text-base text-muted">
              This is held in your wallet before people can respond.
            </Text>
            <TextField
              label={`Amount in ${MARKET.currency}`}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="e.g. 5000"
              error={amountError}
            />
          </View>
        ) : null}

        {step === 3 ? (
          <View className="gap-3">
            <Text className="text-2xl font-bold text-ink">Where should this happen?</Text>
            <Text className="text-base text-muted">
              We only ask for this when you send the request. Exact location stays private until you
              select someone.
            </Text>
            <LocationStep
              purpose="request"
              position={position}
              onPositionChange={setPosition}
              areaLabel={areaLabel}
              onAreaLabelChange={setAreaLabel}
            />
          </View>
        ) : null}

        {step === 4 ? (
          <View className="gap-4">
            <Text className="text-2xl font-bold text-ink">Review your request</Text>

            <Card className="gap-2">
              <Text className="text-lg font-bold text-ink">{trimmedTitle}</Text>
              {trimmedDescription ? (
                <Text className="text-base text-muted">{trimmedDescription}</Text>
              ) : null}
              <Text className="text-sm text-muted">{selectedWhen?.label}</Text>
              <Text className="text-sm text-muted">
                Offer:{' '}
                {isFundedOffer(parsedAmount)
                  ? formatMoney(parsedAmount, MARKET.currency)
                  : 'Not set'}
              </Text>
              <Text className="text-sm text-muted">Location: {areaLabel}</Text>
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
                        (including the service fee). Top up before sending.
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
            label="Send request"
            size="lg"
            loading={create.isPending || (isLastStep && wallet.isPending)}
            disabled={!stepValid[step] || (isLastStep && walletShort)}
            onPress={submit}
          />
        ) : (
          <Button label="Next" size="lg" disabled={!stepValid[step]} onPress={goNext} />
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
        <Header title="Make a request" onBack={() => router.back()} />
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
        <Header title="Make a request" onBack={() => router.back()} />
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
