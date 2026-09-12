import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { addHours, format, set, startOfTomorrow } from 'date-fns';

import { LocationStep } from '@/components/LocationStep';
import { Button } from '@/components/ui/Button';
import { Choice } from '@/components/ui/Choice';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { TextField } from '@/components/ui/TextField';
import { DESCRIPTION_LIMITS, MARKET, SEARCH_RADII_M } from '@/config';
import { useCategories } from '@/features/categories/api';
import { useCreateRequest } from '@/features/requests/requester-api';
import { formatRadius } from '@/lib/format';
import type { Position } from '@/lib/location';
import { syncPushToken } from '@/lib/notifications';
import { colors } from '@/theme';

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

export default function NewRequestScreen() {
  const categories = useCategories();
  const create = useCreateRequest();

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

  const canSubmit =
    Boolean(categorySlug) &&
    trimmedDescription.length >= DESCRIPTION_LIMITS.min &&
    Boolean(position) &&
    areaLabel.trim().length >= 2 &&
    !amountError;

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

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between border-b border-hairline px-5 py-4">
        <Text className="text-xl font-bold text-ink">Make a request</Text>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
        >
          <Ionicons name="close" size={26} color={colors.muted} />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="gap-8 p-5 pb-12" keyboardShouldPersistTaps="handled">
        <View className="gap-3">
          <Text className="text-lg font-semibold text-ink">What do you need?</Text>
          {categories.data.map((category) => (
            <Choice
              key={category.slug}
              title={category.label}
              subtitle={category.tagline}
              icon={category.icon}
              selected={categorySlug === category.slug}
              onPress={() => setCategorySlug(category.slug)}
            />
          ))}
        </View>

        <View className="gap-3">
          <Text className="text-lg font-semibold text-ink">Describe it</Text>
          <TextField
            label="Details"
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

        <View className="gap-3">
          <Text className="text-lg font-semibold text-ink">When?</Text>
          {when.map((option) => (
            <Choice
              key={option.key}
              title={option.label}
              selected={whenKey === option.key}
              onPress={() => setWhenKey(option.key)}
            />
          ))}
        </View>

        <View className="gap-3">
          <Text className="text-lg font-semibold text-ink">What are you offering?</Text>
          <TextField
            label={`Amount in ${MARKET.currency} (optional)`}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="e.g. 5000"
            error={amountError}
            hint="Leave it empty to let people quote you instead."
          />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-semibold text-ink">Where?</Text>
          <LocationStep
            purpose="request"
            position={position}
            onPositionChange={setPosition}
            areaLabel={areaLabel}
            onAreaLabelChange={setAreaLabel}
          />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-semibold text-ink">How far should we look?</Text>
          <Text className="text-base text-muted">
            This decides who is offered your request. It is not shared with anyone, and you can
            widen it later if nobody answers.
          </Text>
          {SEARCH_RADII_M.map((radius) => (
            <Choice
              key={radius}
              title={formatRadius(radius)}
              selected={searchRadiusM === radius}
              onPress={() => setSearchRadiusM(radius)}
            />
          ))}
        </View>

        {create.isError ? <InlineError error={create.error} /> : null}

        <Button
          label="Submit request"
          size="lg"
          disabled={!canSubmit}
          loading={create.isPending}
          onPress={() => {
            const selected = when.find((option) => option.key === whenKey);

            create.mutate(
              {
                categorySlug: categorySlug as string,
                description: trimmedDescription,
                position: position as Position,
                locationLabel: areaLabel.trim(),
                searchRadiusM,
                scheduledFor: selected?.at ?? null,
                offeredAmount: parsedAmount,
              },
              {
                onSuccess: (requestId) => {
                  // Now that someone is waiting on an answer, being told about it is
                  // worth a permission prompt.
                  syncPushToken({ prompt: true });
                  router.replace(`/request/${requestId}`);
                },
              },
            );
          }}
        />
      </ScrollView>
    </Screen>
  );
}
