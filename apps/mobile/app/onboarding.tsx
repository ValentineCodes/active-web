import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { InlineError } from '@/components/ui/StateView';
import { TextField } from '@/components/ui/TextField';
import { useCaptureProfilePhoto, useProfile, useSaveProfile } from '@/features/profile/api';

/**
 * The only thing Active needs before someone can use it is a name to show the person on
 * the other side of a request. No location, no service selection, no role: whether you
 * request or provide is decided later, and can be both.
 */
export default function OnboardingScreen() {
  const { data: profile } = useProfile();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');

  const save = useSaveProfile();
  const capturePhoto = useCaptureProfilePhoto();

  const trimmedName = name.trim();
  const isNameValid = trimmedName.length >= 2 && trimmedName.length <= 60;

  useEffect(() => {
    if (!profile?.display_name) return;
    router.replace('/(tabs)');
  }, [profile?.display_name]);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        contentContainerClassName="flex-grow justify-between gap-8 p-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="mt-8 gap-3">
          <Text className="text-3xl font-bold text-ink">Who are you?</Text>
          <Text className="text-lg text-muted">
            People see this when you ask for help, and when you offer it.
          </Text>
        </View>

        <View className="gap-6">
          <View className="items-center gap-3">
            <Avatar path={profile?.avatar_path} name={trimmedName || null} size="lg" />
            <Pressable
              onPress={() => capturePhoto.mutate({})}
              disabled={capturePhoto.isPending}
              accessibilityRole="button"
              accessibilityLabel="Add a profile photo"
              hitSlop={8}
            >
              <Text className="text-base font-medium text-brand">
                {capturePhoto.isPending ? 'Uploading…' : 'Add a photo (optional)'}
              </Text>
            </Pressable>
          </View>

          <TextField
            label="Your name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Chidi Okafor"
            autoComplete="name"
            autoCapitalize="words"
            hint="Use the name people would recognise you by."
          />

          <TextField
            label="A line about you (optional)"
            value={bio}
            onChangeText={setBio}
            placeholder="e.g. Usually free on weekday evenings around Yaba."
            multiline
            numberOfLines={3}
            counterMax={280}
            maxLength={280}
            hint="Optional — a sentence about you can help people feel comfortable choosing you."
          />

          {capturePhoto.isError ? <InlineError error={capturePhoto.error} /> : null}
          {save.isError ? <InlineError error={save.error} /> : null}
        </View>

        <Button
          label="Continue"
          size="lg"
          corner="2xl"
          disabled={!isNameValid}
          loading={save.isPending}
          onPress={() =>
            save.mutate(
              { display_name: trimmedName, bio: bio.trim() || null },
              {
                onSuccess: () => {
                  requestAnimationFrame(() => {
                    router.replace('/(tabs)');
                  });
                },
              },
            )
          }
        />
      </ScrollView>
    </Screen>
  );
}
