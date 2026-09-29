import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { RequestMoneyLine } from '@/components/RequestMoneyLine';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { ProviderResponseCard } from '@/components/ProviderResponseCard';
import {
  useAcceptResponse,
  useCancelRequest,
  useDeclineResponse,
  useLiveRequest,
  useMyRequest,
  useRequestResponses,
} from '@/features/requests/requester-api';
import { requestMoneyDisplay } from '@/features/requests/payment-display';
import { requestStatusBadge } from '@/features/requests/status';
import {
  chooseResponderDialog,
  chosenResponderMessage,
  helpingYouTitle,
} from '@/features/requests/selection-copy';
import {
  canReuseRequest,
  isExpiredRequestView,
  reuseRequestButtonLabelForRequest,
} from '@/features/requests/reuse';
import { formatAgo, formatWhen } from '@/lib/format';
import { colors } from '@/theme';

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const request = useMyRequest(id);
  const responses = useRequestResponses(id);

  const cancelRequest = useCancelRequest(id);
  const acceptResponse = useAcceptResponse(id);
  const declineResponse = useDeclineResponse(id);

  useLiveRequest(id);

  if (request.isPending) {
    return (
      <Screen>
        <Header title="Request" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (request.isError) {
    return (
      <Screen>
        <Header title="Request" onBack={() => router.back()} />
        <ErrorState error={request.error} onRetry={() => request.refetch()} />
      </Screen>
    );
  }

  const { data } = request;
  const badge = requestStatusBadge(data.status, data.pending_response_count, {
    expiresAt: data.expires_at,
  });
  const moneyDisplay = requestMoneyDisplay({
    requestStatus: data.status,
    paymentStatus: data.payment_status,
    offeredAmount: data.offered_amount,
    agreedProviderAmount: data.agreed_provider_amount,
    currency: data.currency,
    viewerIsRequester: true,
  });
  const pending = responses.data?.filter((response) => response.status === 'pending') ?? [];
  const isExpiredRequest = isExpiredRequestView(data.status, data.expires_at);
  const isOpen = (data.status === 'posted' || data.status === 'searching') && !isExpiredRequest;
  const isConnected = [
    'accepted',
    'in_progress',
    'completion_pending',
    'disputed',
    'no_show',
  ].includes(data.status);
  const reuseLabel = canReuseRequest(data.status, data.expires_at)
    ? reuseRequestButtonLabelForRequest(data.status, data.expires_at)
    : null;

  const confirmCancel = () =>
    Alert.alert('Cancel request?', 'Anyone who responded will be told it is no longer open.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: () =>
          cancelRequest.mutate(undefined, {
            onSuccess: () =>
              Alert.alert(
                'Request cancelled',
                'Anyone who responded has been notified. Your money returns to your wallet.',
              ),
          }),
      },
    ]);

  return (
    <Screen>
      <Header
        title={data.title}
        onBack={() => router.back()}
        right={<Badge label={badge.label} tone={badge.tone} />}
      />

      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-12"
        refreshControl={
          <RefreshControl
            refreshing={request.isRefetching || responses.isRefetching}
            onRefresh={() => {
              request.refetch();
              responses.refetch();
            }}
          />
        }
      >
        <View className="gap-3">
          <Text className="text-base text-muted">{badge.hint}</Text>
          {data.description ? <Text className="text-base text-ink">{data.description}</Text> : null}

          <View className="gap-1">
            <Text className="text-sm text-muted">{formatWhen(data.scheduled_for)}</Text>
            <Text className="text-sm text-muted">{data.location_label}</Text>
            {moneyDisplay ? <RequestMoneyLine display={moneyDisplay} /> : null}
          </View>
        </View>

        {isConnected ? (
          <View className="gap-3">
            <Button
              label="Open your connection"
              variant="active"
              size="lg"
              onPress={() => router.push(`/engagement/${id}`)}
            />
            <Text className="text-center text-sm text-muted">
              Exact location and phone numbers are shared on the connection screen.
            </Text>
          </View>
        ) : null}

        {data.status === 'completed' ? (
          <View className="gap-3">
            <Card>
              <View className="flex-row items-center gap-2">
                <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
                <Text className="text-base font-semibold text-ink">This request is finished</Text>
              </View>
              <Text className="text-sm text-muted">
                {data.completed_at ? `Completed ${formatAgo(data.completed_at)}.` : ''}
              </Text>
            </Card>
            {data.is_rated ? (
              <Button
                label="See the connection"
                variant="secondary"
                onPress={() => router.push(`/engagement/${id}`)}
              />
            ) : (
              <Button label="Rate them" size="lg" onPress={() => router.push(`/rate/${id}`)} />
            )}
            {reuseLabel ? (
              <Button
                label={reuseLabel}
                size="lg"
                onPress={() => router.push(`/request/new?from=${id}`)}
              />
            ) : null}
          </View>
        ) : null}

        {isExpiredRequest ? (
          <View className="gap-3">
            <Card>
              <Text className="text-base font-semibold text-ink">This request expired</Text>
              <Text className="text-sm text-muted">
                Nobody was connected in time. Send a new one when you are ready.
              </Text>
            </Card>
            {reuseLabel ? (
              <Button
                label={reuseLabel}
                size="lg"
                onPress={() => router.push(`/request/new?from=${id}`)}
              />
            ) : null}
          </View>
        ) : null}

        {isOpen ? (
          <View className="gap-4">
            <Text className="text-lg font-bold text-ink">
              {pending.length > 0
                ? `Choose who helps (${pending.length})`
                : 'Waiting for responses'}
            </Text>

            {responses.isPending && !responses.data ? (
              <LoadingState label="Loading responses" />
            ) : null}

            {responses.isError ? (
              <ErrorState error={responses.error} onRetry={() => responses.refetch()} />
            ) : null}

            {responses.isSuccess && pending.length === 0 ? (
              <Card>
                <Text className="text-base text-muted">
                  Your request is visible to people nearby. They see approximate distance, not your
                  exact location.
                </Text>
              </Card>
            ) : null}

            {acceptResponse.isError ? <InlineError error={acceptResponse.error} /> : null}

            {pending.map((response) => (
              <ProviderResponseCard
                key={response.response_id}
                responderId={response.responder_id}
                displayName={response.display_name}
                avatarPath={response.avatar_path}
                bio={response.bio}
                ratingAverage={response.rating_average}
                ratingCount={response.rating_count}
                jobsCompleted={response.jobs_completed}
                phoneVerified={response.phone_verified}
                distanceM={response.distance_m}
                message={response.message}
                quotedAmount={response.quoted_amount}
                currency={data.currency}
                createdAt={response.created_at}
                expiresAt={response.expires_at}
                responderAvailable={response.responder_available}
                acceptLoading={acceptResponse.isPending}
                declineLoading={declineResponse.isPending}
                onDecline={(reason) =>
                  declineResponse.mutate(
                    { responseId: response.response_id, reason },
                    {
                      onSuccess: () =>
                        Alert.alert(
                          'Declined',
                          'They can respond to other requests. You can select someone else anytime.',
                        ),
                    },
                  )
                }
                onAccept={() => {
                  const dialog = chooseResponderDialog(response.display_name);
                  Alert.alert(dialog.title, dialog.message, [
                    { text: dialog.cancel, style: 'cancel' },
                    {
                      text: dialog.confirm,
                      onPress: () =>
                        acceptResponse.mutate(response.response_id, {
                          onSuccess: () => {
                            Alert.alert(
                              helpingYouTitle(response.display_name),
                              chosenResponderMessage(response.display_name),
                              [
                                {
                                  text: 'Open job',
                                  onPress: () => router.replace(`/engagement/${id}`),
                                },
                              ],
                            );
                          },
                        }),
                    },
                  ]);
                }}
              />
            ))}
          </View>
        ) : null}

        {isOpen ? (
          <View className="gap-3">
            {cancelRequest.isError ? <InlineError error={cancelRequest.error} /> : null}
            <Button
              label="Cancel request"
              variant="danger"
              loading={cancelRequest.isPending}
              onPress={confirmCancel}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
