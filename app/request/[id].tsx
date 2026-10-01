import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import { PersonProfileBottomSheet } from '@/components/PersonProfileBottomSheet';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { RequestCompletionCard } from '@/components/request-flow/RequestCompletionCard';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { RequestMetaRow } from '@/components/request-flow/RequestMetaRow';
import { RequestOfferWhenCard } from '@/components/request-flow/RequestOfferWhenCard';
import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { RequestTitleSection } from '@/components/request-flow/RequestTitleSection';
import { ResponseCard } from '@/components/ResponseCard';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import {
  useAcceptResponse,
  useCancelRequest,
  useDeclineResponse,
  useLiveRequest,
  useMyRequest,
  useRequestResponses,
} from '@/features/requests/requester-api';
import { chooseResponderDialog } from '@/features/requests/selection-copy';
import {
  canReuseRequest,
  isExpiredRequestView,
  reuseRequestButtonLabelForRequest,
} from '@/features/requests/reuse';
import { requestStatusBadge } from '@/features/requests/status';
import { formatAgo, formatMoney, formatWhenRequestCard } from '@/lib/format';
import { markRequestResponseNotificationsRead } from '@/features/notifications/inbox';
import { queryKeys } from '@/lib/query/keys';
import { useQueryClient } from '@tanstack/react-query';

type ResponderProfilePreview = {
  userId: string;
  displayName: string | null;
  avatarPath: string | null;
  bio: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  completionPercent: number | null;
  pendingResponse?: {
    responseId: string;
    responderAvailable: boolean;
  };
};

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profileSheetRef = useRef<BottomSheetModal>(null);
  const [profilePreview, setProfilePreview] = useState<ResponderProfilePreview | null>(null);

  const request = useMyRequest(id);
  const responses = useRequestResponses(id);

  const cancelRequest = useCancelRequest(id);
  const acceptResponse = useAcceptResponse(id);
  const declineResponse = useDeclineResponse(id);
  const queryClient = useQueryClient();

  useLiveRequest(id);

  useFocusEffect(
    useCallback(() => {
      void markRequestResponseNotificationsRead(id).then(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnreadCount });
        void queryClient.invalidateQueries({ queryKey: queryKeys.notificationInbox });
      });
    }, [id, queryClient]),
  );

  useEffect(() => {
    if (profilePreview) profileSheetRef.current?.present();
  }, [profilePreview]);

  const openResponderProfile = (preview: ResponderProfilePreview) => {
    setProfilePreview(preview);
  };

  if (request.isPending) {
    return (
      <Screen>
        <RequestFlowHeader title="Your request" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (request.isError) {
    return (
      <Screen>
        <RequestFlowHeader title="Your request" onBack={() => router.back()} />
        <ErrorState error={request.error} onRetry={() => request.refetch()} />
      </Screen>
    );
  }

  const { data } = request;
  const badge = requestStatusBadge(data.status, data.pending_response_count, {
    expiresAt: data.expires_at,
  });
  const pending = responses.data?.filter((response) => response.status === 'pending') ?? [];
  const isExpiredRequest = isExpiredRequestView(data.status, data.expires_at);
  const isOpen = (data.status === 'posted' || data.status === 'searching') && !isExpiredRequest;
  const redirectsToEngagement = [
    'accepted',
    'in_progress',
    'completion_pending',
    'disputed',
    'no_show',
  ].includes(data.status);
  const reuseLabel = canReuseRequest(data.status, data.expires_at)
    ? reuseRequestButtonLabelForRequest(data.status, data.expires_at)
    : null;

  const amount =
    data.offered_amount !== null ? formatMoney(data.offered_amount, data.currency) : null;
  const metaTime = formatAgo(data.updated_at ?? data.created_at);
  const acceptedProvider =
    responses.data?.find((response) => response.status === 'accepted') ?? null;

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

  const menuActions = isOpen
    ? [{ label: 'Cancel request', destructive: true, onPress: confirmCancel }]
    : undefined;

  if (redirectsToEngagement) {
    return <Redirect href={`/engagement/${id}`} />;
  }

  return (
    <Screen>
      <RequestFlowHeader
        title="Your request"
        onBack={() => router.back()}
        menuActions={menuActions}
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
        <RequestMetaRow badgeLabel={badge.label} badgeTone={badge.tone} trailing={metaTime} />

        <RequestTitleSection title={data.title} description={data.description} />

        {amount ? (
          <RequestOfferWhenCard
            amount={amount}
            whenLabel={formatWhenRequestCard(data.scheduled_for)}
          />
        ) : null}

        {data.status === 'completed' ? (
          <RequestCompletionCard
            completedAtLabel={
              data.completed_at
                ? format(new Date(data.completed_at), "EEEE, d MMM 'at' h:mm a")
                : 'Completed'
            }
          />
        ) : null}

        {data.status === 'disputed' ? (
          <RequestCallout tone="danger" title="Issue reported">
            <Text className="text-sm text-muted">Active support is reviewing the issue.</Text>
          </RequestCallout>
        ) : null}

        {data.status === 'completed' && !data.is_rated ? (
          <Button label="Rate them" size="lg" onPress={() => router.push(`/rate/${id}`)} />
        ) : null}

        {data.status === 'completed' && data.is_rated && acceptedProvider ? (
          <RequestPersonCard
            avatarPath={acceptedProvider.avatar_path}
            name={acceptedProvider.display_name}
            ratingAverage={acceptedProvider.rating_average}
            ratingCount={acceptedProvider.rating_count}
            completionPercent={acceptedProvider.completion_percent}
            onPress={() =>
              openResponderProfile({
                userId: acceptedProvider.responder_id,
                displayName: acceptedProvider.display_name,
                avatarPath: acceptedProvider.avatar_path,
                bio: acceptedProvider.bio,
                ratingAverage: acceptedProvider.rating_average,
                ratingCount: acceptedProvider.rating_count,
                completionPercent: acceptedProvider.completion_percent,
              })
            }
          />
        ) : null}

        {reuseLabel && (data.status === 'completed' || isExpiredRequest) ? (
          <Button
            label={reuseLabel}
            size="lg"
            onPress={() => router.push(`/request/new?from=${id}`)}
          />
        ) : null}

        {isExpiredRequest ? (
          <RequestCallout tone="warning" title="Expired">
            <Text className="text-base text-muted">
              Nobody was connected in time. Send a new one when you are ready.
            </Text>
          </RequestCallout>
        ) : null}

        {isOpen ? (
          <View className="gap-4">
            <Text className="text-lg font-bold text-ink">
              {pending.length === 1 ? '1 Response' : `${pending.length} Responses`}
            </Text>

            {responses.isPending && !responses.data ? (
              <LoadingState label="Loading responses" />
            ) : null}

            {responses.isError ? (
              <ErrorState error={responses.error} onRetry={() => responses.refetch()} />
            ) : null}

            {responses.isSuccess && pending.length === 0 ? (
              <Text className="text-base text-muted">
                Your request is visible to people nearby. They see approximate distance, not your
                exact location.
              </Text>
            ) : null}

            {acceptResponse.isError ? <InlineError error={acceptResponse.error} /> : null}

            {pending.map((response) => (
              <ResponseCard
                key={response.response_id}
                displayName={response.display_name}
                avatarPath={response.avatar_path}
                ratingAverage={response.rating_average}
                ratingCount={response.rating_count}
                completionPercent={response.completion_percent}
                onViewProfile={() =>
                  openResponderProfile({
                    userId: response.responder_id,
                    displayName: response.display_name,
                    avatarPath: response.avatar_path,
                    bio: response.bio,
                    ratingAverage: response.rating_average,
                    ratingCount: response.rating_count,
                    completionPercent: response.completion_percent,
                    pendingResponse: {
                      responseId: response.response_id,
                      responderAvailable: response.responder_available,
                    },
                  })
                }
                message={response.message}
                quotedAmount={response.quoted_amount}
                currency={data.currency}
                createdAt={response.created_at}
                responderAvailable={response.responder_available}
              />
            ))}

            {cancelRequest.isError ? <InlineError error={cancelRequest.error} /> : null}
          </View>
        ) : null}
      </ScrollView>

      {profilePreview ? (
        <PersonProfileBottomSheet
          key={profilePreview.userId}
          sheetRef={profileSheetRef}
          userId={profilePreview.userId}
          displayName={profilePreview.displayName}
          avatarPath={profilePreview.avatarPath}
          bio={profilePreview.bio}
          ratingAverage={profilePreview.ratingAverage}
          ratingCount={profilePreview.ratingCount}
          completionPercent={profilePreview.completionPercent}
          responseActions={
            profilePreview.pendingResponse
              ? {
                  responderAvailable: profilePreview.pendingResponse.responderAvailable,
                  acceptLoading: acceptResponse.isPending,
                  declineLoading: declineResponse.isPending,
                  onDecline: (reason) =>
                    declineResponse.mutate(
                      { responseId: profilePreview.pendingResponse!.responseId, reason },
                      {
                        onSuccess: () => {
                          profileSheetRef.current?.dismiss();
                          setProfilePreview(null);
                          Alert.alert(
                            'Declined',
                            'They can respond to other requests. You can select someone else anytime.',
                          );
                        },
                      },
                    ),
                  onAccept: () => {
                    const dialog = chooseResponderDialog(profilePreview.displayName);
                    Alert.alert(dialog.title, dialog.message, [
                      { text: dialog.cancel, style: 'cancel' },
                      {
                        text: dialog.confirm,
                        onPress: () =>
                          acceptResponse.mutate(profilePreview.pendingResponse!.responseId, {
                            onSuccess: () => {
                              profileSheetRef.current?.dismiss();
                              setProfilePreview(null);
                              router.replace(`/engagement/${id}`);
                            },
                          }),
                      },
                    ]);
                  },
                }
              : undefined
          }
        />
      ) : null}
    </Screen>
  );
}
