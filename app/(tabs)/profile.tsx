import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { StarRating } from '@/components/ui/Stars';
import { TextField } from '@/components/ui/TextField';
import { signOut } from '@/features/auth/api';
import { useProfile, useSaveProfile, useUploadAvatar } from '@/features/profile/api';
import { colors } from '@/theme';

export default function ProfileScreen() {
  const profile = useProfile();
  const save = useSaveProfile();
  const uploadAvatar = useUploadAvatar();
  const leave = useMutation({ mutationFn: signOut });

  const [draft, setDraft] = useState<{ name: string; bio: string } | null>(null);

  if (profile.isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (profile.isError) {
    return (
      <Screen>
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      </Screen>
    );
  }

  const { data } = profile;

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-8 p-5 pb-12">
        <View className="items-center gap-3">
          <Avatar path={data.avatar_path} name={data.display_name} size="lg" />
          <Pressable
            onPress={() => uploadAvatar.mutate()}
            disabled={uploadAvatar.isPending}
            accessibilityRole="button"
            accessibilityLabel="Change your profile photo"
            hitSlop={8}
          >
            <Text className="text-base font-medium text-brand">
              {uploadAvatar.isPending ? 'Uploading…' : 'Change photo'}
            </Text>
          </Pressable>

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

        <View className="flex-row gap-3">
          <View className="flex-1 gap-1 rounded-2xl bg-surface p-4">
            <Text className="text-2xl font-bold text-ink">{data.jobs_completed}</Text>
            <Text className="text-sm text-muted">Jobs delivered</Text>
          </View>
          <View className="flex-1 gap-1 rounded-2xl bg-surface p-4">
            <Text className="text-2xl font-bold text-ink">{data.requests_completed}</Text>
            <Text className="text-sm text-muted">Requests completed</Text>
          </View>
        </View>

        <View className="gap-3 rounded-2xl border border-hairline p-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="lock-closed-outline" size={18} color={colors.ink} />
            <Text className="text-base font-semibold text-ink">How your location is used</Text>
          </View>
          <Text className="text-base text-muted">
            Active reads your location only when you submit a request or go Active, and uses it
            privately to work out who is nearby. Nobody sees where you are — only an approximate
            distance — until you accept someone. After that, the two of you can see each
            other&apos;s details.
          </Text>
        </View>

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
