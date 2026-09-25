import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { RequestCategoryDataSection } from '@/components/RequestCategoryDataSection';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { PersonRow } from '@/components/ui/PersonRow';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { TextField } from '@/components/ui/TextField';
import { MARKET } from '@/config';
import { useAvailability } from '@/features/availability/api';
import { useCategoryIndex } from '@/features/categories/api';
import { useRequestForResponse, useRespondToRequest } from '@/features/requests/provider-api';
import { formatDistance, formatMoney, formatWhen } from '@/lib/format';
import {
  parsePositionParam,
  readPositionIfPermitted,
  requestPosition,
  type Position,
} from '@/lib/location';
import { colors } from '@/theme';

export default function RespondScreen() {
  const { id, lat, lng } = useLocalSearchParams<{
    id: string;
    lat?: string;
    lng?: string;
  }>();
  const categories = useCategoryIndex();
  const availability = useAvailability();
  const respond = useRespondToRequest();

  const seedPosition = useMemo(() => parsePositionParam(lat, lng), [lat, lng]);
  const [position, setPosition] = useState<Position | null>(() => seedPosition);
  const [locationChecked, setLocationChecked] = useState(() => seedPosition !== null);

  const { request, hasRequesterProfile, needsLocation, isPending, isError, error, refetch } =
    useRequestForResponse(id, position);

  const [message, setMessage] = useState('');
  const [quote, setQuote] = useState('');
  const [eta, setEta] = useState('');

  const isActive = availability.data?.status === 'available';

  useFocusEffect(
    useCallback(() => {
      if (seedPosition) {
        setPosition(seedPosition);
        setLocationChecked(true);
        return;
      }

      let active = true;

      void (async () => {
        const existing = await readPositionIfPermitted();
        if (!active) return;
        setPosition(existing);
        setLocationChecked(true);
      })();

      return () => {
        active = false;
      };
    }, [seedPosition]),
  );

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

  if (!locationChecked || isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Respond" onClose={() => router.back()} />
        <LoadingState label="Opening this request" />
      </Screen>
    );
  }

  if (needsLocation) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Respond" onClose={() => router.back()} />
        <EmptyState
          icon="location-outline"
          title="Location is needed"
          message="Distance is worked out from where you are. The exact place stays private."
          action={{
            label: 'Use my location',
            onPress: () => {
              requestPosition().then((result) => {
                if (result.ok) setPosition(result.position);
              });
            },
          }}
        />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Respond" onClose={() => router.back()} />
        <ErrorState error={error} onRetry={() => refetch()} />
      </Screen>
    );
  }

  if (!request) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Respond" onClose={() => router.back()} />
        <EmptyState
          icon="close-circle-outline"
          title="This request has moved on"
          message="It was answered, withdrawn, or is no longer a match for what you offer."
          action={{ label: 'Back', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const requesterFirstName = request.requester_display_name?.split(' ')[0];

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Respond" onClose={() => router.back()} />

      <ScrollView contentContainerClassName="gap-8 p-5 pb-12" keyboardShouldPersistTaps="handled">
        <Card>
          <View className="flex-row items-center gap-2">
            <Ionicons
              name={categories.data?.get(request.category_slug)?.icon ?? 'ellipse-outline'}
              size={18}
              color={colors.brand}
            />
            <Text className="text-lg font-bold text-ink">
              {categories.data?.get(request.category_slug)?.label ?? request.category_slug}
            </Text>
          </View>
          <Text className="text-base text-muted">{request.description}</Text>
          <RequestCategoryDataSection
            categorySlug={request.category_slug}
            categoryData={request.category_data}
          />

          <View className="flex-row flex-wrap gap-x-4">
            <Text className="text-sm text-subtle">{formatDistance(request.distance_m)}</Text>
            <Text className="text-sm text-subtle">{request.location_label}</Text>
            <Text className="text-sm text-subtle">{formatWhen(request.scheduled_for)}</Text>
          </View>

          <Text className="text-base font-semibold text-ink">
            {request.offered_amount !== null
              ? `Offering ${formatMoney(request.offered_amount, request.currency)}`
              : 'No amount offered — quote what you would charge.'}
          </Text>

          {hasRequesterProfile ? (
            <View className="border-t border-hairline pt-3">
              <PersonRow
                size="sm"
                avatarPath={request.requester_avatar_path}
                name={request.requester_display_name}
                ratingAverage={request.requester_rating_average}
                ratingCount={request.requester_rating_count}
              />
            </View>
          ) : null}
        </Card>

        {!isActive ? (
          <Card>
            <Text className="text-base text-ink">Go Active to send a response.</Text>
            <Text className="text-sm text-muted">
              Choose what you can help with and how far you will travel, then come back here.
            </Text>
            <Button label="Go Active" onPress={() => router.push('/go-active')} />
          </Card>
        ) : (
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
        )}

        <View className="flex-row items-start gap-3 rounded-2xl bg-surface p-4">
          <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
          <Text className="flex-1 text-sm text-muted">
            {requesterFirstName ?? 'The requester'} sees your name, rating and roughly how far away
            you are. The exact address and phone numbers open up only if they choose you.
          </Text>
        </View>

        {respond.isError ? <InlineError error={respond.error} /> : null}

        {isActive ? (
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
        ) : null}
      </ScrollView>
    </Screen>
  );
}
