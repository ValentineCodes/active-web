import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';

import { LocationStep } from '@/components/LocationStep';
import { Button } from '@/components/ui/Button';
import { Choice } from '@/components/ui/Choice';
import { Header } from '@/components/ui/Header';
import { RadiusSelector } from '@/components/ui/RadiusSelector';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { ACTIVE_DURATIONS, SERVICE_RADII_M } from '@/config';
import { useAvailability, useGoActive } from '@/features/availability/api';
import { useCategories } from '@/features/categories/api';
import type { Position } from '@/lib/location';
import { syncPushToken } from '@/lib/notifications';

/**
 * Going Active is temporary and self-describing: you pick what you can do right now, how
 * far you will travel, and for how long. There is no provider account to apply for, and
 * the choice can be different tomorrow.
 */
export default function GoActiveScreen() {
  const categories = useCategories();
  const availability = useAvailability();
  const goActive = useGoActive();

  // Previous selections are remembered so going Active again is a couple of taps.
  const [selected, setSelected] = useState<string[] | null>(null);
  const [serviceRadiusM, setServiceRadiusM] = useState(10000);
  const [durationMinutes, setDurationMinutes] = useState<number>(240);
  const [position, setPosition] = useState<Position | null>(null);

  const chosen = selected ?? availability.data?.category_slugs ?? [];

  const toggle = (slug: string) =>
    setSelected(chosen.includes(slug) ? chosen.filter((item) => item !== slug) : [...chosen, slug]);

  if (categories.isPending || availability.isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Go Active" onClose={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (categories.isError) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Go Active" onClose={() => router.back()} />
        <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Go Active" onClose={() => router.back()} />

      <ScrollView contentContainerClassName="gap-8 p-5 pb-12" keyboardShouldPersistTaps="handled">
        <Text className="text-base text-muted">
          Pick what you can help with right now. You&apos;ll start seeing requests nearby that
          match, and you choose which ones to answer.
        </Text>

        <View className="gap-3">
          <Text className="text-lg font-bold text-ink">What can you help with?</Text>
          {categories.data.map((category) => (
            <Choice
              key={category.slug}
              title={category.label}
              subtitle={category.tagline}
              icon={category.icon}
              multiple
              selected={chosen.includes(category.slug)}
              onPress={() => toggle(category.slug)}
            />
          ))}
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold text-ink">How far will you travel?</Text>
          <RadiusSelector
            options={SERVICE_RADII_M}
            value={serviceRadiusM}
            onChange={setServiceRadiusM}
          />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold text-ink">For how long?</Text>
          <Text className="text-base text-muted">
            You go offline automatically when this runs out, so you never stay available by
            accident.
          </Text>
          {ACTIVE_DURATIONS.map((option) => (
            <Choice
              key={option.minutes}
              title={option.label}
              selected={durationMinutes === option.minutes}
              onPress={() => setDurationMinutes(option.minutes)}
            />
          ))}
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold text-ink">Where are you?</Text>
          <LocationStep purpose="active" position={position} onPositionChange={setPosition} />
        </View>

        {goActive.isError ? <InlineError error={goActive.error} /> : null}

        <Button
          label="Go Active"
          variant="active"
          size="lg"
          disabled={chosen.length === 0 || !position}
          loading={goActive.isPending}
          onPress={() =>
            goActive.mutate(
              {
                position: position as Position,
                categorySlugs: chosen,
                serviceRadiusM,
                durationMinutes,
              },
              {
                onSuccess: () => {
                  // Requests are useless to an Active provider they never hear about.
                  syncPushToken({ prompt: true });
                  router.replace('/activity');
                },
              },
            )
          }
        />
      </ScrollView>
    </Screen>
  );
}
