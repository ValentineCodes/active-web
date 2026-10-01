import { useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { ProfileCatalogueRail } from '@/components/ProfileCatalogueRail';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { TextField } from '@/components/ui/TextField';
import { useAttendance } from '@/features/attendance/api';
import { signOut } from '@/features/auth/api';
import { useCaptureProfilePhoto, useProfile, useSaveProfile } from '@/features/profile/api';
import { useMyResponses } from '@/features/requests/responses-api';
import { useMyRequests } from '@/features/requests/requester-api';
import type { ThemePreference } from '@/features/theme/preferences';
import { useColors, useTheme } from '@/theme';
import { showAppToast } from '@/lib/toast';

function ProfileStat({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 items-center gap-1 py-4">
      <Text className="text-2xl font-bold text-ink">{value}</Text>
      <Text className="text-sm text-muted">{label}</Text>
    </View>
  );
}

function SettingsRow({
  label,
  onPress,
  showDivider,
}: {
  label: string;
  onPress: () => void;
  showDivider?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="active:opacity-90"
    >
      {showDivider ? <View className="mx-4 h-px bg-hairline" /> : null}
      <View className="flex-row items-center justify-between px-4 py-4">
        <Text className="text-lg text-ink">{label}</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.subtle} />
      </View>
    </Pressable>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">
        {title}
      </Text>
      <View className="overflow-hidden rounded-2xl border border-hairline bg-elevated">
        {children}
      </View>
    </View>
  );
}

const APPEARANCE_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

function AppearancePreferenceRows() {
  const colors = useColors();
  const { preference, setPreference } = useTheme();

  return (
    <>
      {APPEARANCE_OPTIONS.map((option, index) => {
        const selected = preference === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={`Appearance: ${option.label}`}
            accessibilityState={{ selected }}
            onPress={() => void setPreference(option.value)}
            className="active:opacity-90"
          >
            {index > 0 ? <View className="mx-4 h-px bg-hairline" /> : null}
            <View className="flex-row items-center justify-between px-4 py-4">
              <Text className="text-lg text-ink">{option.label}</Text>
              {selected ? (
                <Ionicons name="checkmark" size={22} color={colors.active} />
              ) : (
                <View className="h-[22px] w-[22px]" />
              )}
            </View>
          </Pressable>
        );
      })}
    </>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const profile = useProfile();
  const attendance = useAttendance();
  const myRequests = useMyRequests();
  const myResponses = useMyResponses();
  const save = useSaveProfile();
  const capturePhoto = useCaptureProfilePhoto();
  const leave = useMutation({ mutationFn: signOut });

  const [draft, setDraft] = useState<{ name: string; bio: string } | null>(null);

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
  const completed = data.jobs_completed + data.requests_completed;
  const activeRequests =
    myRequests.data?.filter((request) =>
      ['posted', 'searching', 'accepted', 'in_progress', 'completion_pending'].includes(
        request.status,
      ),
    ).length ?? 0;
  const responseCount = myResponses.data?.length ?? 0;

  const ratingAverage =
    data.rating_count > 0 && data.rating_average !== null ? data.rating_average : null;

  return (
    <Screen>
      <Header title="Profile" onBack={() => router.back()} />

      <ScrollView
        contentContainerClassName="gap-6 px-5 pb-12 pt-2"
        refreshControl={
          <RefreshControl
            refreshing={profile.isRefetching || attendance.isRefetching}
            onRefresh={() => {
              profile.refetch();
              attendance.refetch();
              myRequests.refetch();
              myResponses.refetch();
            }}
          />
        }
      >
        <View className="items-center gap-2">
          <Pressable
            onPress={() =>
              capturePhoto.mutate({}, { onSuccess: () => showAppToast('Profile updated') })
            }
            disabled={capturePhoto.isPending}
            accessibilityRole="button"
            accessibilityLabel="Update profile photo"
          >
            <Avatar
              path={data.avatar_path}
              name={data.display_name}
              size="lg"
              showActiveDot={attending}
            />
          </Pressable>
          {draft ? null : (
            <>
              <Text className="text-2xl font-bold text-ink">{data.display_name}</Text>
              {ratingAverage !== null ? (
                <View className="flex-row items-center gap-1">
                  <Ionicons name="star" size={14} color={colors.warning} />
                  <Text className="text-sm text-muted">{ratingAverage.toFixed(1)}</Text>
                </View>
              ) : null}
              {data.bio ? (
                <Text className="max-w-sm text-center text-base leading-6 text-muted">
                  {data.bio}
                </Text>
              ) : null}
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
                    {
                      onSuccess: () => {
                        setDraft(null);
                        showAppToast('Profile updated');
                      },
                    },
                  )
                }
              />
            </View>
          </View>
        ) : null}

        <View className="flex-row overflow-hidden rounded-2xl border border-hairline bg-elevated">
          <ProfileStat value={activeRequests} label="Requests" />
          <View className="w-px bg-hairline" />
          <ProfileStat value={completed} label="Completed" />
          <View className="w-px bg-hairline" />
          <ProfileStat value={responseCount} label="Responses" />
        </View>

        <ProfileCatalogueRail />

        <SettingsGroup title="Account">
          <SettingsRow
            label="Edit profile"
            onPress={() => setDraft({ name: data.display_name ?? '', bio: data.bio ?? '' })}
          />
          <SettingsRow label="Payment details" onPress={() => router.push('/wallet')} showDivider />
          <SettingsRow label="Verify identity" onPress={() => {}} showDivider />
        </SettingsGroup>

        <SettingsGroup title="Preferences">
          <SettingsRow
            label="Notifications"
            onPress={() => router.push('/notification-settings')}
          />
          <View className="mx-4 h-px bg-hairline" />
          <AppearancePreferenceRows />
          <SettingsRow label="Privacy" onPress={() => {}} showDivider />
          <SettingsRow label="Language" onPress={() => {}} showDivider />
        </SettingsGroup>

        <SettingsGroup title="Support">
          <SettingsRow label="Help & support" onPress={() => {}} />
          <SettingsRow label="Report a problem" onPress={() => {}} showDivider />
          <SettingsRow label="About Active" onPress={() => {}} showDivider />
        </SettingsGroup>

        <View className="gap-3 pt-2">
          {leave.isError ? <InlineError error={leave.error} /> : null}
          <Pressable
            onPress={() => leave.mutate()}
            disabled={leave.isPending}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            className="items-center justify-center py-3 active:opacity-80"
          >
            <Text className="text-lg font-semibold text-danger">
              {leave.isPending ? 'Signing out…' : 'Sign out'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}
