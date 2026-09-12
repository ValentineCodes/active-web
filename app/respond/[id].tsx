import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { StarRating } from '@/components/ui/Stars';
import { TextField } from '@/components/ui/TextField';
import { MARKET } from '@/config';
import { useCategoryIndex } from '@/features/categories/api';
import { useNearbyRequests, useRespondToRequest } from '@/features/requests/provider-api';
import { formatDistance, formatMoney, formatWhen } from '@/lib/format';
import { colors } from '@/theme';

export default function RespondScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const categories = useCategoryIndex();
  const respond = useRespondToRequest();

  const [message, setMessage] = useState('');
  const [quote, setQuote] = useState('');
  const [eta, setEta] = useState('');

  // Read the request from the same eligibility-checked list the inbox uses, so this
  // screen can never show something the server would refuse a response to.
  const nearby = useNearbyRequests({ enabled: true });
  const request = nearby.data?.find((item) => item.request_id === id);

  const parsedQuote = quote.trim() ? Number(quote.replace(/[^\d.]/g, '')) : null;
  const parsedEta = eta.trim() ? Number(eta.replace(/[^\d]/g, '')) : null;

  const quoteError =
    parsedQuote !== null && (Number.isNaN(parsedQuote) || parsedQuote < 0)
      ? 'Enter a number, or leave this empty.'
      : null;
  const etaError =
    parsedEta !== null && (Number.isNaN(parsedEta) || parsedEta < 1 || parsedEta > 1440)
      ? 'Enter minutes between 1 and 1440.'
      : null;

  if (nearby.isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState />
      </Screen>
    );
  }

  if (nearby.isError) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ErrorState error={nearby.error} onRetry={() => nearby.refetch()} />
      </Screen>
    );
  }

  if (!request) {
    return (
      <Screen edges={['top', 'bottom']}>
        <EmptyState
          icon="close-circle-outline"
          title="This request has moved on"
          message="It was answered, withdrawn, or is no longer a match for what you offer."
          action={{ label: 'Back to Activity', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between border-b border-hairline px-5 py-4">
        <Text className="text-xl font-bold text-ink">Respond</Text>
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
        <View className="gap-3 rounded-2xl border border-hairline p-4">
          <Text className="text-lg font-semibold text-ink">
            {categories.data?.get(request.category_slug)?.label ?? request.category_slug}
          </Text>
          <Text className="text-base text-muted">{request.description}</Text>

          <View className="flex-row flex-wrap gap-x-4">
            <Text className="text-sm text-muted">{formatDistance(request.distance_m)}</Text>
            <Text className="text-sm text-muted">{request.location_label}</Text>
            <Text className="text-sm text-muted">{formatWhen(request.scheduled_for)}</Text>
          </View>

          <Text className="text-base font-medium text-ink">
            {request.offered_amount !== null
              ? `Offering ${formatMoney(request.offered_amount, request.currency)}`
              : 'No amount offered — quote what you would charge.'}
          </Text>

          <View className="flex-row items-center gap-3 border-t border-hairline pt-3">
            <Avatar
              path={request.requester_avatar_path}
              name={request.requester_display_name}
              size="sm"
            />
            <View className="flex-1">
              <Text className="text-base font-medium text-ink">
                {request.requester_display_name}
              </Text>
              <StarRating
                average={request.requester_rating_average}
                count={request.requester_rating_count}
              />
            </View>
          </View>
        </View>

        <View className="gap-4">
          <TextField
            label="Message (optional)"
            value={message}
            onChangeText={setMessage}
            placeholder="e.g. I repair Elepaq generators. Can be there in 30 minutes."
            multiline
            numberOfLines={4}
            maxLength={500}
            counterMax={500}
          />

          <TextField
            label={`Your price in ${MARKET.currency} (optional)`}
            value={quote}
            onChangeText={setQuote}
            keyboardType="numeric"
            placeholder="e.g. 7000"
            error={quoteError}
          />

          <TextField
            label="How soon can you be there, in minutes (optional)"
            value={eta}
            onChangeText={setEta}
            keyboardType="number-pad"
            placeholder="e.g. 30"
            error={etaError}
          />
        </View>

        <View className="gap-2 rounded-2xl bg-surface p-4">
          <Text className="text-sm font-semibold text-ink">Before you send</Text>
          <Text className="text-sm text-muted">
            {request.requester_display_name?.split(' ')[0] ?? 'The requester'} sees your name,
            rating and roughly how far away you are. The exact address and phone numbers open up
            only if they choose you.
          </Text>
        </View>

        {respond.isError ? <InlineError error={respond.error} /> : null}

        <Button
          label="Send response"
          size="lg"
          disabled={Boolean(quoteError || etaError)}
          loading={respond.isPending}
          onPress={() =>
            respond.mutate(
              {
                requestId: request.request_id,
                message: message.trim() || null,
                quotedAmount: parsedQuote,
                etaMinutes: parsedEta,
              },
              { onSuccess: () => router.back() },
            )
          }
        />
      </ScrollView>
    </Screen>
  );
}
