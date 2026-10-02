import { useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui/Avatar';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { useCaptureProfilePhoto, useProfile, useSaveProfile } from '@/features/profile/api';
import { cn } from '@/lib/cn';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme';

function EditField({
  label,
  className,
  ...inputProps
}: { label: string } & ComponentProps<typeof TextInput>) {
  const colors = useColors();

  return (
    <View className="gap-2">
      <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.subtle}
        className={cn('rounded-2xl bg-surface px-4 py-4 text-base text-ink', className)}
        {...inputProps}
      />
    </View>
  );
}

function EditProfileForm({
  avatarPath,
  displayName,
  initialBio,
}: {
  avatarPath: string | null;
  displayName: string;
  initialBio: string | null;
}) {
  const colors = useColors();
  const save = useSaveProfile();
  const capturePhoto = useCaptureProfilePhoto();

  const [name, setName] = useState(displayName);
  const [bio, setBio] = useState(initialBio ?? '');

  const trimmedName = name.trim();
  const canSave = trimmedName.length >= 2 && !save.isPending;

  const handleSave = () => {
    if (!canSave) return;
    save.mutate(
      { display_name: trimmedName, bio: bio.trim() || null },
      {
        onSuccess: () => {
          showAppToast('Profile updated');
          router.back();
        },
      },
    );
  };

  return (
    <>
      <Header
        title="Edit profile"
        onBack={() => router.back()}
        right={
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel="Save profile"
            hitSlop={8}
            className="active:opacity-80"
          >
            <Text className={`text-base font-semibold ${canSave ? 'text-active' : 'text-muted'}`}>
              Save
            </Text>
          </Pressable>
        }
      />

      <ScrollView
        contentContainerClassName="gap-8 px-5 pb-12 pt-2"
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center gap-3">
          <Pressable
            onPress={() =>
              capturePhoto.mutate({}, { onSuccess: () => showAppToast('Profile updated') })
            }
            disabled={capturePhoto.isPending}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            className="active:opacity-90"
          >
            <View className="relative">
              <Avatar path={avatarPath} name={trimmedName || displayName} size="lg" />
              <View className="absolute -bottom-0.5 -right-0.5 h-8 w-8 items-center justify-center rounded-full bg-active">
                <Ionicons name="add" size={20} color={colors.onBrand} />
              </View>
            </View>
          </Pressable>
          <Pressable
            onPress={() =>
              capturePhoto.mutate({}, { onSuccess: () => showAppToast('Profile updated') })
            }
            disabled={capturePhoto.isPending}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            hitSlop={8}
            className="active:opacity-80"
          >
            <Text className="text-base font-medium text-active">
              {capturePhoto.isPending ? 'Uploading…' : 'Change profile photo'}
            </Text>
          </Pressable>
        </View>

        <View className="gap-5">
          <EditField
            label="Full name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            maxLength={60}
          />
          <EditField
            label="About you"
            value={bio}
            onChangeText={setBio}
            multiline
            textAlignVertical="top"
            className="min-h-32 py-4"
            maxLength={280}
          />
          <Text className="px-1 text-sm leading-5 text-muted">
            Your name, photo, completion rate, and catalogue help people decide who to work with.
          </Text>
        </View>

        {capturePhoto.isError ? <InlineError error={capturePhoto.error} /> : null}
        {save.isError ? <InlineError error={save.error} /> : null}
      </ScrollView>
    </>
  );
}

export default function EditProfileScreen() {
  const profile = useProfile();

  if (profile.isPending) {
    return (
      <Screen>
        <Header title="Edit profile" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (profile.isError) {
    return (
      <Screen>
        <Header title="Edit profile" onBack={() => router.back()} />
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      </Screen>
    );
  }

  const { data } = profile;

  return (
    <Screen edges={['top', 'bottom']}>
      <EditProfileForm
        key={data.id}
        avatarPath={data.avatar_path}
        displayName={data.display_name ?? ''}
        initialBio={data.bio}
      />
    </Screen>
  );
}
