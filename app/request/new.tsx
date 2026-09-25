import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { addHours, format, set, startOfTomorrow } from 'date-fns';

import { LocationStep } from '@/components/LocationStep';
import { RequestCategoryDetailsStep } from '@/components/RequestCategoryDetailsStep';
import { RequestFundingSummary } from '@/components/RequestFundingSummary';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Choice } from '@/components/ui/Choice';
import { Header } from '@/components/ui/Header';
import { RadiusSelector } from '@/components/ui/RadiusSelector';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { TextField } from '@/components/ui/TextField';
import { DESCRIPTION_LIMITS, MARKET, REQUEST_REQUIRES_FUNDING, SEARCH_RADII_M } from '@/config';
import { useCategories, type ServiceCategory } from '@/features/categories/api';
import {
  categoryDetailsError,
  categoryDetailsFromCategoryData,
  categoryDetailsSummary,
  emptyCategoryDetails,
  type RequestCategorySlug,
} from '@/features/requests/category-data';
import { isFundedOffer } from '@/features/requests/funding';
import { canReuseRequest } from '@/features/requests/reuse';
import { useCreateRequest, useMyRequest } from '@/features/requests/requester-api';
import { cn } from '@/lib/cn';
import { formatMoney, formatRadius } from '@/lib/format';
import type { Position } from '@/lib/location';
import type { Json } from '@/lib/supabase/database.types';
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

const STEP_TITLES = ['What', 'Details', 'When', 'Offer', 'Where', 'Review'];

function isRequestCategorySlug(slug: string): slug is RequestCategorySlug {
  return ['ride', 'delivery', 'errand', 'repair', 'cleaning', 'moving', 'other'].includes(slug);
}

type ReuseSeed = {
  sourceRequestId: string;
  categorySlug: RequestCategorySlug;
  description: string;
  categoryData: Json;
  offeredAmount: number | null;
  latitude: number;
  longitude: number;
  locationLabel: string;
  searchRadiusM: number;
};

function newRequestFormState(reuse?: ReuseSeed) {
  if (!reuse) {
    return {
      categorySlug: null as string | null,
      description: '',
      categoryDetails: emptyCategoryDetails(),
      whenKey: 'asap',
      amount: '',
      position: null as Position | null,
      areaLabel: '',
      searchRadiusM: 5000,
    };
  }

  return {
    categorySlug: reuse.categorySlug,
    description: reuse.description,
    categoryDetails: categoryDetailsFromCategoryData(reuse.categorySlug, reuse.categoryData),
    whenKey: 'asap',
    amount: reuse.offeredAmount !== null ? String(reuse.offeredAmount) : '',
    position: { latitude: reuse.latitude, longitude: reuse.longitude },
    areaLabel: reuse.locationLabel,
    searchRadiusM: reuse.searchRadiusM,
  };
}

function NewRequestForm({
  categories,
  reuseSeed,
}: {
  categories: ServiceCategory[];
  reuseSeed?: ReuseSeed;
}) {
  const seeded = newRequestFormState(reuseSeed);
  const create = useCreateRequest();

  const [step, setStep] = useState(0);
  const [categorySlug, setCategorySlug] = useState(seeded.categorySlug);
  const [description, setDescription] = useState(seeded.description);
  const [categoryDetails, setCategoryDetails] = useState(seeded.categoryDetails);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [whenKey, setWhenKey] = useState(seeded.whenKey);
  const [amount, setAmount] = useState(seeded.amount);
  const [position, setPosition] = useState<Position | null>(seeded.position);
  const [areaLabel, setAreaLabel] = useState(seeded.areaLabel);
  const [searchRadiusM, setSearchRadiusM] = useState(seeded.searchRadiusM);

  const reusingPrior = Boolean(reuseSeed);
  const when = whenOptions();
  const trimmedDescription = description.trim();
  const parsedAmount = amount.trim() ? Number(amount.replace(/[^\d.]/g, '')) : null;
  const typedCategory = categorySlug && isRequestCategorySlug(categorySlug) ? categorySlug : null;

  const amountError =
    parsedAmount !== null && (Number.isNaN(parsedAmount) || parsedAmount < 0)
      ? 'Enter a valid amount.'
      : REQUEST_REQUIRES_FUNDING && !isFundedOffer(parsedAmount)
        ? 'Enter what you are offering so your request can go live.'
        : null;

  const stepValid = [
    Boolean(typedCategory) && trimmedDescription.length >= DESCRIPTION_LIMITS.min,
    typedCategory ? categoryDetailsError(typedCategory, categoryDetails) === null : false,
    true,
    REQUEST_REQUIRES_FUNDING ? isFundedOffer(parsedAmount) && !amountError : amountError === null,
    Boolean(position) && areaLabel.trim().length >= 2,
    Boolean(typedCategory) &&
      (REQUEST_REQUIRES_FUNDING ? isFundedOffer(parsedAmount) : true) &&
      Boolean(position) &&
      categoryDetailsError(typedCategory, categoryDetails) === null,
  ];

  const category = categories.find((item) => item.slug === categorySlug);
  const selectedWhen = when.find((option) => option.key === whenKey);
  const isFirstStep = step === 0;
  const isLastStep = step === STEP_TITLES.length - 1;
  const detailSummary = typedCategory ? categoryDetailsSummary(typedCategory, categoryDetails) : [];

  const goNext = () => {
    if (step === 1 && typedCategory) {
      const error = categoryDetailsError(typedCategory, categoryDetails);
      if (error) {
        setDetailsError(error);
        return;
      }
      setDetailsError(null);
    }
    setStep((current) => Math.min(current + 1, STEP_TITLES.length - 1));
  };

  const goBack = () => setStep((current) => Math.max(current - 1, 0));

  const submit = () => {
    const offeredAmount = parsedAmount;
    if (
      !typedCategory ||
      !position ||
      (REQUEST_REQUIRES_FUNDING && !isFundedOffer(offeredAmount)) ||
      categoryDetailsError(typedCategory, categoryDetails)
    ) {
      return;
    }

    create.mutate(
      {
        categorySlug: typedCategory,
        description: trimmedDescription,
        position,
        locationLabel: areaLabel.trim(),
        searchRadiusM,
        scheduledFor: selectedWhen?.at ?? null,
        offeredAmount,
        categoryDetails,
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
              {categories.map((item) => (
                <Choice
                  key={item.slug}
                  title={item.label}
                  subtitle={item.tagline}
                  icon={item.icon}
                  selected={categorySlug === item.slug}
                  onPress={() => {
                    if (categorySlug !== item.slug) {
                      setCategoryDetails(emptyCategoryDetails());
                      setDetailsError(null);
                    }
                    setCategorySlug(item.slug);
                  }}
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

        {step === 1 && typedCategory ? (
          <RequestCategoryDetailsStep
            categorySlug={typedCategory}
            details={categoryDetails}
            onChange={(next) => {
              setCategoryDetails(next);
              if (detailsError) setDetailsError(null);
            }}
            error={detailsError}
          />
        ) : null}

        {step === 2 ? (
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

        {step === 3 ? (
          <View className="gap-3">
            <Text className="text-2xl font-bold text-ink">What are you offering?</Text>
            <Text className="text-base text-muted">
              {REQUEST_REQUIRES_FUNDING
                ? 'This is held before providers can see your request.'
                : 'Optional — leave it empty to let people quote you instead.'}
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

        {step === 4 ? (
          <View className="gap-8">
            <View className="gap-3">
              <Text className="text-2xl font-bold text-ink">Where should this happen?</Text>
              <Text className="text-base text-muted">
                We only ask for this when you are ready to send the request. It is used to find
                nearby providers, not during sign-up.
              </Text>
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

        {step === 5 ? (
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

              {detailSummary.length > 0 ? (
                <View className="gap-1 border-t border-hairline pt-3">
                  {detailSummary.map((line) => (
                    <Text key={line.label} className="text-sm text-muted">
                      {line.label}: {line.value}
                    </Text>
                  ))}
                </View>
              ) : null}

              <View className="gap-1 border-t border-hairline pt-3">
                <Text className="text-sm text-muted">
                  Offer:{' '}
                  {isFundedOffer(parsedAmount)
                    ? formatMoney(parsedAmount, MARKET.currency)
                    : 'Not set'}
                </Text>
                <Text className="text-sm text-muted">Location: {areaLabel}</Text>
                <Text className="text-sm text-muted">
                  Search radius: {formatRadius(searchRadiusM)}
                </Text>
              </View>

              {isFundedOffer(parsedAmount) ? (
                <RequestFundingSummary offeredAmount={parsedAmount} />
              ) : null}
            </Card>

            {create.isError ? <InlineError error={create.error} /> : null}
          </View>
        ) : null}
      </ScrollView>

      <View className="gap-3 border-t border-hairline p-5">
        {isLastStep ? (
          <Button
            label="Send request"
            size="lg"
            loading={create.isPending}
            disabled={!stepValid[step]}
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

  const categories = useCategories();
  const sourceRequest = useMyRequest(sourceRequestId ?? '');

  if (categories.isPending || (sourceRequestId && sourceRequest.isPending)) {
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
    sourceRequestId && sourceRequest.data && isRequestCategorySlug(sourceRequest.data.category_slug)
      ? {
          sourceRequestId,
          categorySlug: sourceRequest.data.category_slug,
          description: sourceRequest.data.description,
          categoryData: sourceRequest.data.category_data,
          offeredAmount: sourceRequest.data.offered_amount,
          latitude: sourceRequest.data.latitude,
          longitude: sourceRequest.data.longitude,
          locationLabel: sourceRequest.data.location_label,
          searchRadiusM: sourceRequest.data.search_radius_m,
        }
      : undefined;

  return (
    <NewRequestForm
      key={reuseSeed?.sourceRequestId ?? 'new'}
      categories={categories.data}
      reuseSeed={reuseSeed}
    />
  );
}
