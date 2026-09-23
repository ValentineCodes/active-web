import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { addHours, format, set, startOfTomorrow } from 'date-fns';

import { LocationStep } from '@/components/LocationStep';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Choice } from '@/components/ui/Choice';
import { Header } from '@/components/ui/Header';
import { RadiusSelector } from '@/components/ui/RadiusSelector';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { TextField } from '@/components/ui/TextField';
import { DESCRIPTION_LIMITS, MARKET, SEARCH_RADII_M } from '@/config';
import { useCategories } from '@/features/categories/api';
import { useCreateRequest } from '@/features/requests/requester-api';
import { cn } from '@/lib/cn';
import { formatMoney, formatRadius } from '@/lib/format';
import type { Position } from '@/lib/location';
import { syncPushToken } from '@/lib/notifications';

/**
 * "When" is deliberately a short list of concrete times rather than a calendar. Real
 * scheduling is out of MVP scope, and these cover what someone asking for help now
 * actually means.
 */
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

const STEP_TITLES = ['What do you need?', 'When?', 'What are you offering?', 'Where?', 'Review'];

/**
 * A short wizard rather than one long form: each step asks one question, so making a
 * request never feels like filling out a listing. Nothing here changes what gets
 * submitted — it is the same fields as a single form, just revealed a step at a time,
 * with location deliberately the second-to-last thing asked for.
 */
export default function NewRequestScreen() {
  const categories = useCategories();
  const create = useCreateRequest();

  const [step, setStep] = useState(0);
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [whenKey, setWhenKey] = useState<string>('asap');
  const [amount, setAmount] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [areaLabel, setAreaLabel] = useState('');
  const [searchRadiusM, setSearchRadiusM] = useState<number>(5000);

  const when = whenOptions();
  const trimmedDescription = description.trim();
  const parsedAmount = amount.trim() ? Number(amount.replace(/[^\d.]/g, '')) : null;

  const amountError =
    parsedAmount !== null && (Number.isNaN(parsedAmount) || parsedAmount < 0)
      ? 'Enter a number, or leave this empty.'
      : null;

  const stepValid = [
    Boolean(categorySlug) && trimmedDescription.length >= DESCRIPTION_LIMITS.min,
    true,
    !amountError,
    Boolean(position) && areaLabel.trim().length >= 2,
    true,
  ];

  if (categories.isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState />
      </Screen>
    );
  }

  if (categories.isError) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
      </Screen>
    );
  }

  const category = categories.data.find((item) => item.slug === categorySlug);
  const selectedWhen = when.find((option) => option.key === whenKey);
  const isFirstStep = step === 0;
  const isLastStep = step === STEP_TITLES.length - 1;

  const goNext = () => setStep((current) => Math.min(current + 1, STEP_TITLES.length - 1));
  const goBack = () => setStep((current) => Math.max(current - 1, 0));

  const submit = () => {
    create.mutate(
      {
        categorySlug: categorySlug as string,
        description: trimmedDescription,
        position: position as Position,
        locationLabel: areaLabel.trim(),
        searchRadiusM,
        scheduledFor: selectedWhen?.at ?? null,
        offeredAmount: parsedAmount,
      },
      {
        onSuccess: (requestId) => {
          // Now that someone is waiting on an answer, being told about it is worth a
          // permission prompt.
          syncPushToken({ prompt: true });
          router.replace(`/request/${requestId}`);
        },
      },
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Make a request" onBack={isFirstStep ? () => router.back() : goBack} />

      <View className="flex-row gap-1.5 px-5 pb-2">
        {STEP_TITLES.map((title, index) => (
          <View
            key={title}
            className={cn('h-1.5 flex-1 rounded-full', index <= step ? 'bg-brand' : 'bg-surface')}
          />
        ))}
      </View>

      <ScrollView contentContainerClassName="gap-6 p-5 pb-12" keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <View className="gap-6">
            <Text className="text-2xl font-bold text-ink">What do you need?</Text>
            <View className="gap-3">
              {categories.data.map((item) => (
                <Choice
                  key={item.slug}
                  title={item.label}
                  subtitle={item.tagline}
                  icon={item.icon}
                  selected={categorySlug === item.slug}
                  onPress={() => setCategorySlug(item.slug)}
                />
              ))}
            </View>
            <TextField
              label="Describe it"
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. My generator won't start. It's a 5kVA Elepaq, ran fine yesterday."
              multiline
              numberOfLines={5}
              maxLength={DESCRIPTION_LIMITS.max}
              counterMax={DESCRIPTION_LIMITS.max}
              hint={
                trimmedDescription.length < DESCRIPTION_LIMITS.min
                  ? `At least ${DESCRIPTION_LIMITS.min} characters, so people know what they're taking on.`
                  : undefined
              }
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
              Optional — leave it empty to let people quote you instead.
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
          <View className="gap-8">
            <View className="gap-3">
              <Text className="text-2xl font-bold text-ink">Where should this happen?</Text>
              <LocationStep
                purpose="request"
                position={position}
                onPositionChange={setPosition}
                areaLabel={areaLabel}
                onAreaLabelChange={setAreaLabel}
              />
            </View>

            <View className="gap-3">
              <Text className="text-lg font-bold text-ink">How far should we look?</Text>
              <Text className="text-base text-muted">
                This decides who is offered your request. You can widen it later if nobody answers.
              </Text>
              <RadiusSelector
                options={SEARCH_RADII_M}
                value={searchRadiusM}
                onChange={setSearchRadiusM}
              />
            </View>
          </View>
        ) : null}

        {step === 4 ? (
          <View className="gap-4">
            <Text className="text-2xl font-bold text-ink">Review your request</Text>

            <Card>
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-ink">
                  {category?.label ?? categorySlug}
                </Text>
                <Text className="text-sm text-muted">{selectedWhen?.label}</Text>
              </View>
              <Text className="text-base text-muted">{trimmedDescription}</Text>
              <View className="gap-1 border-t border-hairline pt-3">
                <Text className="text-sm text-muted">
                  Offer:{' '}
                  {parsedAmount !== null
                    ? formatMoney(parsedAmount, MARKET.currency)
                    : 'Open to quotes'}
                </Text>
                <Text className="text-sm text-muted">Location: {areaLabel}</Text>
                <Text className="text-sm text-muted">
                  Search radius: {formatRadius(searchRadiusM)}
                </Text>
              </View>
            </Card>

            {create.isError ? <InlineError error={create.error} /> : null}
          </View>
        ) : null}
      </ScrollView>

      <View className="gap-3 border-t border-hairline p-5">
        {isLastStep ? (
          <Button label="Send request" size="lg" loading={create.isPending} onPress={submit} />
        ) : (
          <Button label="Next" size="lg" disabled={!stepValid[step]} onPress={goNext} />
        )}
      </View>
    </Screen>
  );
}
