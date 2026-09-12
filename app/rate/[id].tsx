import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { StarPicker } from '@/components/ui/Stars';
import { TextField } from '@/components/ui/TextField';
import { useEngagement, useRateRequest } from '@/features/requests/requester-api';
import { colors } from '@/theme';

const PROMPTS = [
  'What went wrong?',
  'What went wrong?',
  'What could have been better?',
  'What went well?',
  'What made it great?',
] as const;

export default function RateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const engagement = useEngagement(id);
  const rate = useRateRequest(id);

  const [stars, setStars] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  if (engagement.isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState />
      </Screen>
    );
  }

  if (engagement.isError || !engagement.data) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ErrorState error={engagement.error} onRetry={() => engagement.refetch()} />
      </Screen>
    );
  }

  const data = engagement.data;
  const firstName = data.counterparty_display_name?.split(' ')[0] ?? 'them';

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-end px-5 py-4">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
        >
          <Ionicons name="close" size={26} color={colors.muted} />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="flex-grow justify-between gap-8 p-5 pb-12">
        <View className="items-center gap-4">
          <Avatar
            path={data.counterparty_avatar_path}
            name={data.counterparty_display_name}
            size="lg"
          />
          <Text className="text-center text-2xl font-bold text-ink">How did {firstName} do?</Text>
          <Text className="text-center text-base text-muted">
            Your rating is what helps the next person decide.
          </Text>
        </View>

        <View className="gap-6">
          <StarPicker value={stars} onChange={setStars} />

          {stars !== null ? (
            <TextField
              label={PROMPTS[stars - 1] ?? 'Anything to add?'}
              value={comment}
              onChangeText={setComment}
              placeholder="Optional"
              multiline
              numberOfLines={4}
              maxLength={500}
              counterMax={500}
            />
          ) : null}

          {rate.isError ? <InlineError error={rate.error} /> : null}
        </View>

        <Button
          label="Submit rating"
          size="lg"
          disabled={stars === null}
          loading={rate.isPending}
          onPress={() =>
            rate.mutate(
              { stars: stars as number, comment: comment.trim() || null },
              { onSuccess: () => router.dismissTo('/requests') },
            )
          }
        />
      </ScrollView>
    </Screen>
  );
}
