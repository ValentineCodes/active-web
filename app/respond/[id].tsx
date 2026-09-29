import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAttendance, isAttendingAnotherRequest } from '@/features/attendance/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { TextField } from '@/components/ui/TextField';
import { MARKET } from '@/config';
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
  const attendance = useAttendance();
  const respond = useRespondToRequest();

  const seedPosition = useMemo(() => parsePositionParam(lat, lng), [lat, lng]);
  const [position, setPosition] = useState<Position | null>(() => seedPosition);
  const [locationChecked, setLocationChecked] = useState(() => seedPosition !== null);

  const {
    request,
    existingResponse,
    needsLocation,
    isFetchingMatch,
    isPending,
    isError,
    error,
    refetch,
  } = useRequestForResponse(id, position);

  const [message, setMessage] = useState('');
  const [quote, setQuote] = useState('');
  const seededResponseId = useRef<string | null>(null);

  useEffect(() => {
    if (!existingResponse || seededResponseId.current === existingResponse.responseId) return;
    seededResponseId.current = existingResponse.responseId;
    setMessage(existingResponse.message ?? '');
    setQuote(existingResponse.quotedAmount !== null ? String(existingResponse.quotedAmount) : '');
  }, [existingResponse]);

  const attendingElsewhere = isAttendingAnotherRequest(attendance.data, id);

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

  const quoteError =
    parsedQuote !== null && (Number.isNaN(parsedQuote) || parsedQuote < 0)
      ? 'Enter a number, or leave this empty.'
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
          message="It was answered, withdrawn, or is no longer open near you."
          action={{ label: 'Back', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const canRespond = !attendingElsewhere && Boolean(position);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Respond" onClose={() => router.back()} />

      <ScrollView contentContainerClassName="gap-8 p-5 pb-12" keyboardShouldPersistTaps="handled">
        <Card>
          <Text className="text-lg font-bold text-ink">{request.title}</Text>
          {request.description ? (
            <Text className="text-base text-muted">{request.description}</Text>
          ) : null}

          <View className="flex-row flex-wrap gap-x-4">
            <Text className="text-sm text-subtle">{formatDistance(request.distance_m)}</Text>
            <Text className="text-sm text-subtle">{request.location_label}</Text>
            <Text className="text-sm text-subtle">{formatWhen(request.scheduled_for)}</Text>
          </View>

          <Text className="text-base font-semibold text-ink">
            Offering {formatMoney(request.offered_amount!, request.currency)}
          </Text>
        </Card>

        {attendingElsewhere ? (
          <Card>
            <Text className="text-base text-ink">You&apos;re on another job.</Text>
            <Text className="text-sm text-muted">
              Finish that request before responding to new ones. Sending a response does not commit
              you — only being selected does.
            </Text>
          </Card>
        ) : isFetchingMatch ? (
          <LoadingState label="Checking this request" />
        ) : (
          <View className="gap-4">
            <TextField
              label="Message (optional)"
              value={message}
              onChangeText={setMessage}
              placeholder="e.g. I can be there in 30 minutes."
              multiline
              numberOfLines={4}
              maxLength={500}
              counterMax={500}
            />

            <TextField
              label={`Counter offer in ${MARKET.currency} (optional)`}
              value={quote}
              onChangeText={setQuote}
              keyboardType="numeric"
              placeholder="Leave empty to accept their offer"
              error={quoteError}
            />
          </View>
        )}

        <View className="flex-row items-start gap-3 rounded-2xl bg-surface p-4">
          <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
          <Text className="flex-1 text-sm text-muted">
            They see your name, rating and approximate distance. Exact location and phone open only
            if they select you.
          </Text>
        </View>

        {respond.isError ? <InlineError error={respond.error} /> : null}

        {canRespond && !attendingElsewhere ? (
          <Button
            label={existingResponse ? 'Update response' : 'Send response'}
            size="lg"
            disabled={Boolean(quoteError)}
            loading={respond.isPending}
            onPress={() =>
              respond.mutate(
                {
                  requestId: request.request_id,
                  message: message.trim() || null,
                  quotedAmount: parsedQuote,
                  position,
                },
                {
                  onSuccess: () => {
                    Alert.alert(
                      existingResponse ? 'Response updated' : 'Response sent',
                      'The requester can compare your offer with others.',
                      [{ text: 'OK', onPress: () => router.back() }],
                    );
                  },
                },
              )
            }
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
