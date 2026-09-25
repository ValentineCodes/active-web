import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
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
import { hasProviderPhotoReady, useCaptureProfilePhoto, useProfile } from '@/features/profile/api';
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
  const profile = useProfile();
  const goActive = useGoActive();
  const capturePhoto = useCaptureProfilePhoto();

  // Previous selections are remembered so going Active again is a couple of taps.
  const [selected, setSelected] = useState<string[] | null>(null);
  const [serviceRadiusM, setServiceRadiusM] = useState(10000);
  const [durationMinutes, setDurationMinutes] = useState<number>(240);
  const [position, setPosition] = useState<Position | null>(null);
  const [photoProgress, setPhotoProgress] = useState<number | null>(null);

  const chosen = selected ?? availability.data?.category_slugs ?? [];

  const toggle = (slug: string) =>
    setSelected(chosen.includes(slug) ? chosen.filter((item) => item !== slug) : [...chosen, slug]);

  const submitGoActive = () => {
    if (!position) return;

    goActive.mutate(
      {
        position,
        categorySlugs: chosen,
        serviceRadiusM,
        durationMinutes,
      },
      {
        onSuccess: () => {
          syncPushToken({ prompt: true });
          router.replace('/activity');
        },
      },
    );
  };

  const promptForProviderPhoto = () => {
    Alert.alert(
      'Take your provider photo',
      'Requesters need to see who they are choosing. Capture a photo with your camera now — you can reuse it whenever you go Active again.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Open camera',
          onPress: () => {
            setPhotoProgress(0);
            capturePhoto.mutate(
              { onProgress: setPhotoProgress },
              {
                onSettled: () => setPhotoProgress(null),
                onSuccess: (captured) => {
                  if (captured) submitGoActive();
                },
              },
            );
          },
        },
      ],
    );
  };

  const onPressGoActive = () => {
    if (chosen.length === 0 || !position) return;

    if (!hasProviderPhotoReady(profile.data)) {
      promptForProviderPhoto();
      return;
    }

    submitGoActive();
  };

  if (categories.isPending || availability.isPending || profile.isPending) {
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

        {!hasProviderPhotoReady(profile.data) ? (
          <View className="gap-2 rounded-2xl bg-active-soft p-4">
            <Text className="text-base font-semibold text-ink">Provider photo required</Text>
            <Text className="text-sm text-muted">
              You&apos;ll take a quick in-app photo the first time you go Active. It stays on your
              profile for next time.
            </Text>
          </View>
        ) : null}

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

        {photoProgress !== null ? (
          <View className="gap-2 rounded-2xl bg-surface p-3">
            <Text className="text-sm text-muted">Uploading profile photo…</Text>
            <View className="h-2 overflow-hidden rounded-full bg-canvas">
              <View
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.round(photoProgress * 100)}%` }}
              />
            </View>
          </View>
        ) : null}

        {goActive.isError ? <InlineError error={goActive.error} /> : null}
        {capturePhoto.isError ? <InlineError error={capturePhoto.error} /> : null}

        <Button
          label="Go Active"
          variant="active"
          size="lg"
          disabled={chosen.length === 0 || !position}
          loading={goActive.isPending || capturePhoto.isPending}
          onPress={onPressGoActive}
        />
      </ScrollView>
    </Screen>
  );
}
