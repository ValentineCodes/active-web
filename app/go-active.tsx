import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';

import { LocationStep } from '@/components/LocationStep';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Choice } from '@/components/ui/Choice';
import { Header } from '@/components/ui/Header';
import { RadiusSelector } from '@/components/ui/RadiusSelector';
import { Screen } from '@/components/ui/Screen';
import { ServiceTag } from '@/components/ui/ServiceTag';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { ACTIVE_DURATIONS, SERVICE_RADII_M } from '@/config';
import { useAvailability, useGoActive } from '@/features/availability/api';
import { useCategories } from '@/features/categories/api';
import { hasProviderPhotoReady, useCaptureProfilePhoto, useProfile } from '@/features/profile/api';
import type { Position } from '@/lib/location';
import { cn } from '@/lib/cn';
import { formatRadius } from '@/lib/format';
import { syncPushToken } from '@/lib/notifications';

const STEP_TITLES = ['Services', 'Radius', 'Duration', 'Photo', 'Where', 'Review'];

/**
 * Going Active is a short wizard, like making a request: one decision per step, then a
 * review before you enter the pool. Catalogue media is not part of this flow.
 */
export default function GoActiveScreen() {
  const categories = useCategories();
  const availability = useAvailability();
  const profile = useProfile();
  const goActive = useGoActive();
  const capturePhoto = useCaptureProfilePhoto();

  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [serviceRadiusM, setServiceRadiusM] = useState<number | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number>(240);
  const [position, setPosition] = useState<Position | null>(null);
  const [photoProgress, setPhotoProgress] = useState<number | null>(null);

  const chosen = selected ?? availability.data?.category_slugs ?? [];
  const radius = serviceRadiusM ?? availability.data?.service_radius_m ?? 10000;
  const photoReady = hasProviderPhotoReady(profile.data);
  const durationLabel =
    ACTIVE_DURATIONS.find((option) => option.minutes === durationMinutes)?.label ?? '';

  const toggle = (slug: string) =>
    setSelected(chosen.includes(slug) ? chosen.filter((item) => item !== slug) : [...chosen, slug]);

  const stepValid = [
    chosen.length > 0,
    true,
    true,
    photoReady,
    Boolean(position),
    chosen.length > 0 && photoReady && Boolean(position),
  ];

  const isFirstStep = step === 0;
  const isLastStep = step === STEP_TITLES.length - 1;

  const goNext = () => setStep((current) => Math.min(current + 1, STEP_TITLES.length - 1));
  const goBack = () => setStep((current) => Math.max(current - 1, 0));

  const submit = () => {
    if (!position || chosen.length === 0 || !photoReady) return;

    goActive.mutate(
      {
        position,
        categorySlugs: chosen,
        serviceRadiusM: radius,
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

  if (categories.isPending || availability.isPending || profile.isPending) {
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

  const busy = goActive.isPending || capturePhoto.isPending;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Go Active" onBack={isFirstStep ? () => router.back() : goBack} />

      <View className="flex-row gap-1.5 px-5 pb-2">
        {STEP_TITLES.map((title, index) => (
          <View
            key={title}
            className={cn('h-1.5 flex-1 rounded-full', index <= step ? 'bg-active' : 'bg-surface')}
          />
        ))}
      </View>

      <ScrollView contentContainerClassName="gap-6 p-5 pb-12" keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <View className="gap-6">
            <Text className="text-2xl font-bold text-ink">What can you help with?</Text>
            <Text className="text-base text-muted">
              Pick every service you can take on right now. Going Active does not answer requests
              for you — you choose which ones to respond to.
            </Text>
            <View className="gap-3">
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
          </View>
        ) : null}

        {step === 1 ? (
          <View className="gap-3">
            <Text className="text-2xl font-bold text-ink">How far will you travel?</Text>
            <Text className="text-base text-muted">
              Requests outside this distance will not appear in your inbox.
            </Text>
            <RadiusSelector options={SERVICE_RADII_M} value={radius} onChange={setServiceRadiusM} />
          </View>
        ) : null}

        {step === 2 ? (
          <View className="gap-3">
            <Text className="text-2xl font-bold text-ink">For how long?</Text>
            <Text className="text-base text-muted">
              You go offline when this runs out. You can also go offline yourself. Your services
              stay saved either way.
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
        ) : null}

        {step === 3 ? (
          <View className="gap-6">
            <Text className="text-2xl font-bold text-ink">Your provider photo</Text>
            <Text className="text-base text-muted">
              Requesters see this before they choose someone. It must be taken in the app with your
              camera. Work samples are optional and not required here.
            </Text>

            {photoReady && profile.data ? (
              <View className="items-center gap-3">
                <Avatar
                  path={profile.data.avatar_path}
                  name={profile.data.display_name}
                  size="lg"
                />
                <Text className="text-base font-semibold text-ink">You&apos;re set</Text>
                <Text className="text-center text-sm text-muted">
                  Retake anytime from your profile.
                </Text>
              </View>
            ) : (
              <View className="gap-3">
                <Button
                  label={capturePhoto.isPending ? 'Opening camera…' : 'Take photo'}
                  icon="camera-outline"
                  variant="secondary"
                  loading={capturePhoto.isPending}
                  onPress={() => {
                    setPhotoProgress(0);
                    capturePhoto.mutate(
                      { onProgress: setPhotoProgress },
                      { onSettled: () => setPhotoProgress(null) },
                    );
                  }}
                />
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
              </View>
            )}

            {capturePhoto.isError ? <InlineError error={capturePhoto.error} /> : null}
          </View>
        ) : null}

        {step === 4 ? (
          <View className="gap-3">
            <Text className="text-2xl font-bold text-ink">Where are you now?</Text>
            <Text className="text-base text-muted">
              We only ask when you are ready to go Active. Your position is used to match nearby
              requests and is cleared when you go offline.
            </Text>
            <LocationStep purpose="active" position={position} onPositionChange={setPosition} />
          </View>
        ) : null}

        {step === 5 ? (
          <View className="gap-4">
            <Text className="text-2xl font-bold text-ink">Review and go Active</Text>

            <Card>
              <Text className="text-lg font-bold text-ink">Services</Text>
              <View className="flex-row flex-wrap gap-2">
                {chosen.map((slug) => {
                  const category = categories.data.find((item) => item.slug === slug);
                  return (
                    <ServiceTag key={slug} label={category?.label ?? slug} icon={category?.icon} />
                  );
                })}
              </View>

              <View className="gap-1 border-t border-hairline pt-3">
                <Text className="text-sm text-muted">Service radius: {formatRadius(radius)}</Text>
                <Text className="text-sm text-muted">Available for: {durationLabel}</Text>
                <Text className="text-sm text-muted">
                  Provider photo: {photoReady ? 'Ready' : 'Still needed'}
                </Text>
                <Text className="text-sm text-muted">
                  Location: {position ? 'Captured' : 'Still needed'}
                </Text>
              </View>
            </Card>

            <Text className="text-sm text-muted">
              You stay available for other requests until someone selects you for a job.
            </Text>

            {goActive.isError ? <InlineError error={goActive.error} /> : null}
          </View>
        ) : null}
      </ScrollView>

      <View className="gap-3 border-t border-hairline p-5">
        {isLastStep ? (
          <Button
            label="Go Active"
            variant="active"
            size="lg"
            loading={busy}
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
