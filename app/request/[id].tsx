import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import { ProviderResponseCard } from '@/components/ProviderResponseCard';
import { RequestCategoryDataSection } from '@/components/RequestCategoryDataSection';
import { useCategoryIndex } from '@/features/categories/api';
import {
  useAcceptResponse,
  useCancelRequest,
  useDeclineResponse,
  useExpandRadius,
  useLiveRequest,
  useMyRequest,
  useRequestResponses,
} from '@/features/requests/requester-api';
import { requestStatusBadge } from '@/features/requests/status';
import {
  canReuseRequest,
  isExpiredRequestView,
  reuseRequestButtonLabelForRequest,
} from '@/features/requests/reuse';
import { formatAgo, formatMoney, formatRadius, formatWhen } from '@/lib/format';
import { colors } from '@/theme';

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const request = useMyRequest(id);
  const responses = useRequestResponses(id);
  const categories = useCategoryIndex();

  const expandRadius = useExpandRadius(id);
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
  const badge = requestStatusBadge(data.status, data.pending_response_count);
  const category = categories.data?.get(data.category_slug);
  const pending = responses.data?.filter((response) => response.status === 'pending') ?? [];
  const isExpiredRequest = isExpiredRequestView(data.status, data.expires_at);
  const isSearching = data.status === 'searching' && !isExpiredRequest;
  const isConnected = ['accepted', 'in_progress'].includes(data.status);
  const reuseLabel = canReuseRequest(data.status, data.expires_at)
    ? reuseRequestButtonLabelForRequest(data.status, data.expires_at)
    : null;

  const confirmCancel = () =>
    Alert.alert('Cancel this request?', 'Anyone who responded will be told it is no longer open.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: () => cancelRequest.mutate(),
      },
    ]);

  return (
    <Screen>
      <Header
        title={category?.label ?? data.category_slug}
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
          <Text className="text-base text-ink">{data.description}</Text>
          <RequestCategoryDataSection
            categorySlug={data.category_slug}
            categoryData={data.category_data}
          />

          <View className="gap-1">
            <Text className="text-sm text-muted">{formatWhen(data.scheduled_for)}</Text>
            <Text className="text-sm text-muted">
              {data.location_label} · searching within {formatRadius(data.search_radius_m)}
            </Text>
            {data.offered_amount !== null ? (
              <Text className="text-sm font-semibold text-ink">
                You offered {formatMoney(data.offered_amount, data.currency)}
              </Text>
            ) : null}
          </View>
        </View>

        {isConnected ? (
          <Button
            label="Open your connection"
            variant="active"
            size="lg"
            onPress={() => router.push(`/engagement/${id}`)}
          />
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
              <Button
                label="Rate your provider"
                size="lg"
                onPress={() => router.push(`/rate/${id}`)}
              />
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
                Nobody was connected in time. Your original request stays here as history — send a
                new one when you are ready.
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

        {isSearching ? (
          <View className="gap-4">
            <Text className="text-lg font-bold text-ink">
              {pending.length > 0
                ? `${pending.length} ${pending.length === 1 ? 'person' : 'people'} can help`
                : 'Looking for someone'}
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
                  Your request is with everyone Active nearby who offers{' '}
                  {category?.label.toLowerCase() ?? 'this'}. Nobody can see where you are — only
                  roughly how far away you are.
                </Text>
                <Text className="text-base text-muted">
                  If nobody answers, widen the area you&apos;re searching. That changes who gets
                  offered the request, and nothing else.
                </Text>
                {expandRadius.isError ? <InlineError error={expandRadius.error} /> : null}
                <Button
                  label={`Search wider than ${formatRadius(data.search_radius_m)}`}
                  variant="secondary"
                  loading={expandRadius.isPending}
                  onPress={() => expandRadius.mutate()}
                />
              </Card>
            ) : null}

            {acceptResponse.isError ? <InlineError error={acceptResponse.error} /> : null}

            {pending.map((response) => (
              <ProviderResponseCard
                key={response.response_id}
                providerId={response.provider_id}
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
                etaMinutes={response.eta_minutes}
                currency={data.currency}
                createdAt={response.created_at}
                expiresAt={response.expires_at}
                acceptLoading={acceptResponse.isPending}
                declineLoading={declineResponse.isPending}
                onDecline={(reason) =>
                  declineResponse.mutate({ responseId: response.response_id, reason })
                }
                onAccept={() =>
                  Alert.alert(
                    `Select ${response.display_name}?`,
                    'This is the handshake — you can only choose one person. They get your exact location and phone number, you get theirs, and everyone else who responded is turned down.',
                    [
                      { text: 'Not yet', style: 'cancel' },
                      {
                        text: 'Select',
                        onPress: () => acceptResponse.mutate(response.response_id),
                      },
                    ],
                  )
                }
              />
            ))}
          </View>
        ) : null}

        {isSearching || data.status === 'accepted' ? (
          <View className="gap-3">
            {cancelRequest.isError ? <InlineError error={cancelRequest.error} /> : null}
            <Button
              label="Cancel this request"
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
