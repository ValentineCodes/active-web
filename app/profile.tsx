import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { ProfileMediaSection } from '@/components/ServiceCatalogue';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState, SuccessBanner } from '@/components/ui/StateView';
import { StarRating } from '@/components/ui/Stars';
import { TextField } from '@/components/ui/TextField';
import { useAttendance } from '@/features/attendance/api';
import { signOut } from '@/features/auth/api';
import {
  hasProfilePhotoReady,
  useCaptureProfilePhoto,
  useProfile,
  useSaveProfile,
} from '@/features/profile/api';
import { colors } from '@/theme';

export default function ProfileScreen() {
  const profile = useProfile();
  const attendance = useAttendance();
  const save = useSaveProfile();
  const capturePhoto = useCaptureProfilePhoto();
  const leave = useMutation({ mutationFn: signOut });

  const [draft, setDraft] = useState<{ name: string; bio: string } | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);

  if (profile.isPending) {
    return (
      <Screen>
        <Header title="Profile" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (profile.isError) {
    return (
      <Screen>
        <Header title="Profile" onBack={() => router.back()} />
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      </Screen>
    );
  }

  const { data } = profile;
  const attending = attendance.data?.attending_request_id != null;
  const completedRequests = data.jobs_completed + data.requests_completed;
  const photoVerified = hasProfilePhotoReady(data);

  const onCapturePhoto = () =>
    capturePhoto.mutate(
      {},
      {
        onSuccess: (saved) => {
          if (saved) setPhotoNotice('Profile photo updated.');
        },
      },
    );

  return (
    <Screen>
      <Header title="Profile" onBack={() => router.back()} />

      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-12"
        refreshControl={
          <RefreshControl
            refreshing={profile.isRefetching || attendance.isRefetching}
            onRefresh={() => {
              profile.refetch();
              attendance.refetch();
            }}
          />
        }
      >
        <View className="items-center gap-3">
          <Pressable
            onPress={onCapturePhoto}
            disabled={capturePhoto.isPending}
            accessibilityRole="button"
            accessibilityLabel="Take your profile photo"
          >
            <Avatar
              path={data.avatar_path}
              name={data.display_name}
              size="lg"
              showActiveDot={attending}
            />
          </Pressable>
          <Pressable
            onPress={onCapturePhoto}
            disabled={capturePhoto.isPending}
            accessibilityRole="button"
            accessibilityLabel="Take your profile photo"
            hitSlop={8}
          >
            <Text className="text-base font-medium text-brand">
              {capturePhoto.isPending
                ? 'Uploading…'
                : photoVerified
                  ? 'Retake photo'
                  : 'Take profile photo'}
            </Text>
          </Pressable>
          <Text className="max-w-xs text-center text-sm text-muted">
            Use your camera so people recognise you when you ask for help or offer it.
          </Text>
          {photoNotice ? <SuccessBanner message={photoNotice} /> : null}
          {capturePhoto.isError ? <InlineError error={capturePhoto.error} /> : null}

          {draft ? null : (
            <>
              <Text className="text-2xl font-bold text-ink">{data.display_name}</Text>
              {data.bio ? (
                <Text className="text-center text-base text-muted">{data.bio}</Text>
              ) : null}
              <StarRating average={data.rating_average} count={data.rating_count} />
            </>
          )}
        </View>

        {draft ? (
          <View className="gap-4">
            <TextField
              label="Your name"
              value={draft.name}
              onChangeText={(name) => setDraft({ ...draft, name })}
              autoCapitalize="words"
            />
            <TextField
              label="A line about you"
              value={draft.bio}
              onChangeText={(bio) => setDraft({ ...draft, bio })}
              multiline
              numberOfLines={3}
              maxLength={280}
              counterMax={280}
            />

            {save.isError ? <InlineError error={save.error} /> : null}

            <View className="flex-row gap-3">
              <Button
                label="Cancel"
                variant="secondary"
                className="flex-1"
                onPress={() => setDraft(null)}
              />
              <Button
                label="Save"
                className="flex-1"
                loading={save.isPending}
                disabled={draft.name.trim().length < 2}
                onPress={() =>
                  save.mutate(
                    { display_name: draft.name.trim(), bio: draft.bio.trim() || null },
                    { onSuccess: () => setDraft(null) },
                  )
                }
              />
            </View>
          </View>
        ) : (
          <Button
            label="Edit profile"
            variant="secondary"
            onPress={() => setDraft({ name: data.display_name ?? '', bio: data.bio ?? '' })}
          />
        )}

        <Card className="items-start gap-3">
          <Text className="text-2xl font-bold text-ink">{completedRequests}</Text>
          <Text className="text-sm text-muted">
            {completedRequests === 1 ? 'Completed request' : 'Completed requests'}
          </Text>
          <Text className="text-sm text-muted">
            {data.jobs_completed} helped others · {data.requests_completed} you posted
          </Text>
        </Card>

        <Card className="gap-3">
          <Text className="text-base font-semibold text-ink">Trust on Active</Text>
          <View className="flex-row flex-wrap gap-2">
            {data.phone ? <Badge label="Phone verified" tone="info" dot={false} /> : null}
            {photoVerified ? (
              <Badge label="Profile photo verified" tone="info" dot={false} />
            ) : null}
          </View>
          {!photoVerified ? (
            <Text className="text-sm text-muted">
              A camera profile photo is required before you respond to a request.
            </Text>
          ) : null}
        </Card>

        <Button label="Wallet" variant="secondary" onPress={() => router.push('/wallet')} />

        <ProfileMediaSection />

        <Card>
          <View className="flex-row items-center gap-2">
            <Ionicons name="lock-closed-outline" size={18} color={colors.ink} />
            <Text className="text-base font-semibold text-ink">How your location is used</Text>
          </View>
          <Text className="text-base text-muted">
            Active uses your location when you post, browse nearby, or respond — only to work out
            distance. Nobody sees where you are until you select someone.
          </Text>
        </Card>

        <View className="gap-3">
          <Text className="text-sm text-muted">Signed in as {data.phone}</Text>
          {leave.isError ? <InlineError error={leave.error} /> : null}
          <Button
            label="Sign out"
            variant="danger"
            loading={leave.isPending}
            onPress={() => leave.mutate()}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
