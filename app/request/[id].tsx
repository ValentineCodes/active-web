import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { addHours, format, set } from 'date-fns';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import { PersonProfileBottomSheet } from '@/components/PersonProfileBottomSheet';
import {
  ExtendResponseDeadlineSheet,
  type ExtendResponseDeadlineSheetHandle,
} from '@/components/request-flow/ExtendResponseDeadlineSheet';
import { ReportIssueModal } from '@/components/ReportIssueModal';
import { RequestAttachmentSection } from '@/components/request-flow/RequestAttachmentSection';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { RequestCompletionCard } from '@/components/request-flow/RequestCompletionCard';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { RequestMetaRow } from '@/components/request-flow/RequestMetaRow';
import { RequestOfferWhenCard } from '@/components/request-flow/RequestOfferWhenCard';
import { RequestConnectionActions } from '@/components/request-flow/RequestConnectionActions';
import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { RequestTagsLine } from '@/components/request-flow/RequestTagsLine';
import { RequestTitleSection } from '@/components/request-flow/RequestTitleSection';
import { ResponseCard } from '@/components/ResponseCard';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/StateView';
import {
  useAcceptResponse,
  useCancelRequest,
  useDeclineResponse,
  useExtendRequest,
  useLiveRequest,
  useMyRequest,
  useOwnerExpireRequest,
  useRequestResponses,
} from '@/features/requests/requester-api';
import {
  useOpenPreHandshakeConversation,
  useRequestConversation,
} from '@/features/requests/conversation-api';
import { chooseResponderDialog } from '@/features/requests/selection-copy';
import { myRequestActivityBadge } from '@/features/requests/activity-list';
import { isRequestEditable } from '@/features/requests/edit-eligibility';
import {
  canReuseRequest,
  isAwaitingReviewRequestView,
  isExpiredRequestView,
  reuseRequestButtonLabelForRequest,
} from '@/features/requests/reuse';
import { REQUEST_MAX_LIFETIME_HOURS } from '@/features/domain/model';
import {
  formatAgo,
  formatMoney,
  formatRequestOfferLocationLabel,
  formatWhenHome,
  formatWhenRequestCard,
} from '@/lib/format';
import { markRequestResponseNotificationsRead } from '@/features/notifications/inbox';
import { REQUEST_REPORT_ISSUES } from '@/features/support/report-issue-options';
import { usePullToRefresh } from '@/lib/query/use-pull-to-refresh';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { showAppToast } from '@/lib/toast';
import { queryKeys } from '@/lib/query/keys';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMyWallet } from '@/features/wallet/api';
import {
  isInsufficientWalletBalanceError,
  toUserMessage,
} from '@/lib/supabase/errors';
import { openWalletTopUp, walletLockAmountMajor } from '@/features/wallet/top-up';

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
  const extendDeadlineSheetRef = useRef<ExtendResponseDeadlineSheetHandle>(null);
  const reopenExtendSheetAfterPickerRef = useRef(false);
  const [profilePreview, setProfilePreview] = useState<ResponderProfilePreview | null>(null);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);

  const request = useMyRequest(id);
  const responses = useRequestResponses(id);
  const conversation = useRequestConversation(id, Boolean(request.data?.selected_user_id));

  const cancelRequest = useCancelRequest(id);
  const extendRequest = useExtendRequest(id);
  const ownerExpireRequest = useOwnerExpireRequest(id);
  const acceptResponse = useAcceptResponse(id);
  const declineResponse = useDeclineResponse(id);
  const [extendDeadlineAt, setExtendDeadlineAt] = useState(() =>
    addHours(new Date(), REQUEST_MAX_LIFETIME_HOURS),
  );
  const [extendIosPicker, setExtendIosPicker] = useState<'date' | 'time' | null>(null);
  const [extendIosPickerDraft, setExtendIosPickerDraft] = useState(() =>
    addHours(new Date(), REQUEST_MAX_LIFETIME_HOURS),
  );
  const safeInsets = useSafeAreaInsets();

  const extendDeadlineDateLabel = useMemo(
    () => format(extendDeadlineAt, 'EEEE, d MMM'),
    [extendDeadlineAt],
  );
  const extendDeadlineTimeLabel = useMemo(
    () => format(extendDeadlineAt, 'h:mm a'),
    [extendDeadlineAt],
  );
  const openPreHandshakeChat = useOpenPreHandshakeConversation();
  const queryClient = useQueryClient();
  const wallet = useMyWallet();

  useLiveRequest(id);

  const dismissProfileSheet = useCallback(() => {
    profileSheetRef.current?.dismiss();
    setProfilePreview(null);
  }, []);

  const showInsufficientWalletAlert = useCallback(
    (error: unknown, requiredLockMajor: number) => {
      Alert.alert('Not enough in your wallet', toUserMessage(error), [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Add money',
          onPress: () =>
            openWalletTopUp({
              returnTo: `/request/${id}`,
              requiredLockMajor,
              availableMajor: wallet.data?.available ?? 0,
            }),
        },
      ]);
    },
    [id, wallet.data?.available],
  );

  const discussResponse = useCallback(
    (responseId: string) => {
      openPreHandshakeChat.mutate(responseId, {
        onSuccess: (conversationId) => {
          dismissProfileSheet();
          router.push(`/conversation/${conversationId}`);
        },
      });
    },
    [dismissProfileSheet, openPreHandshakeChat],
  );

  const acceptResponder = useCallback(
    (responseId: string, onAccepted?: () => void) => {
      const offered = request.data?.offered_amount;
      if (offered == null) return;

      const quoted =
        responses.data?.find((row) => row.response_id === responseId)?.quoted_amount ?? null;
      const requiredLockMajor = walletLockAmountMajor({ offeredAmount: offered, quotedAmount: quoted });

      acceptResponse.mutate(responseId, {
        onSuccess: () => {
          onAccepted?.();
          showAppToast('Payment is being confirmed', 'info');
          router.replace(`/engagement/${id}`);
        },
        onError: (error) => {
          if (isInsufficientWalletBalanceError(error)) {
            dismissProfileSheet();
            showInsufficientWalletAlert(error, requiredLockMajor);
          }
        },
      });
    },
    [
      acceptResponse,
      dismissProfileSheet,
      id,
      request.data?.offered_amount,
      responses.data,
      showInsufficientWalletAlert,
    ],
  );

  useFocusEffect(
    useCallback(() => {
      void wallet.refetch();
      void markRequestResponseNotificationsRead(id).then(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnreadCount });
        void queryClient.invalidateQueries({ queryKey: queryKeys.notificationInbox });
      });
    }, [id, queryClient, wallet.refetch]),
  );

  const onPullRefresh = useCallback(
    () => Promise.all([request.refetch(), responses.refetch()]),
    [request, responses],
  );
  const { refreshing, onRefresh } = usePullToRefresh(onPullRefresh);

  useEffect(() => {
    if (profilePreview) profileSheetRef.current?.present();
  }, [profilePreview]);

  const openResponderProfile = (preview: ResponderProfilePreview) => {
    setProfilePreview(preview);
  };

  const finishExtendPickerFlow = useCallback(() => {
    setExtendIosPicker(null);
    if (!reopenExtendSheetAfterPickerRef.current) return;
    reopenExtendSheetAfterPickerRef.current = false;
    requestAnimationFrame(() => {
      extendDeadlineSheetRef.current?.present();
    });
  }, []);

  const runAfterExtendSheetDismissed = useCallback((run: () => void) => {
    reopenExtendSheetAfterPickerRef.current = true;
    extendDeadlineSheetRef.current?.dismiss();
    setTimeout(run, 350);
  }, []);

  const openExtendDatePicker = useCallback(() => {
    runAfterExtendSheetDismissed(() => {
      if (Platform.OS === 'android') {
        DateTimePickerAndroid.open({
          value: extendDeadlineAt,
          mode: 'date',
          minimumDate: new Date(),
          maximumDate: addHours(new Date(), REQUEST_MAX_LIFETIME_HOURS),
          onDismiss: finishExtendPickerFlow,
          onChange: (event, date) => {
            if (event.type === 'dismissed') {
              finishExtendPickerFlow();
              return;
            }
            if (event.type !== 'set' || !date) return;
            setExtendDeadlineAt((prev) =>
              set(prev, {
                year: date.getFullYear(),
                month: date.getMonth(),
                date: date.getDate(),
              }),
            );
            finishExtendPickerFlow();
          },
        });
        return;
      }

      setExtendIosPickerDraft(extendDeadlineAt);
      setExtendIosPicker('date');
    });
  }, [extendDeadlineAt, finishExtendPickerFlow, runAfterExtendSheetDismissed]);

  const openExtendTimePicker = useCallback(() => {
    runAfterExtendSheetDismissed(() => {
      if (Platform.OS === 'android') {
        DateTimePickerAndroid.open({
          value: extendDeadlineAt,
          mode: 'time',
          onDismiss: finishExtendPickerFlow,
          onChange: (event, date) => {
            if (event.type === 'dismissed') {
              finishExtendPickerFlow();
              return;
            }
            if (event.type !== 'set' || !date) return;
            setExtendDeadlineAt((prev) =>
              set(prev, {
                hours: date.getHours(),
                minutes: date.getMinutes(),
                seconds: 0,
                milliseconds: 0,
              }),
            );
            finishExtendPickerFlow();
          },
        });
        return;
      }

      setExtendIosPickerDraft(extendDeadlineAt);
      setExtendIosPicker('time');
    });
  }, [extendDeadlineAt, finishExtendPickerFlow, runAfterExtendSheetDismissed]);

  const confirmExtendIosPicker = useCallback(() => {
    if (extendIosPicker === 'date') {
      setExtendDeadlineAt((prev) =>
        set(prev, {
          year: extendIosPickerDraft.getFullYear(),
          month: extendIosPickerDraft.getMonth(),
          date: extendIosPickerDraft.getDate(),
        }),
      );
    } else if (extendIosPicker === 'time') {
      setExtendDeadlineAt((prev) =>
        set(prev, {
          hours: extendIosPickerDraft.getHours(),
          minutes: extendIosPickerDraft.getMinutes(),
          seconds: 0,
          milliseconds: 0,
        }),
      );
    }
    finishExtendPickerFlow();
  }, [extendIosPicker, extendIosPickerDraft, finishExtendPickerFlow]);

  if (showQuerySkeleton(request)) {
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

  const data = request.data;
  if (!data) {
    return (
      <Screen>
        <RequestFlowHeader title="Your request" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }
  const badge = myRequestActivityBadge({
    status: data.status,
    expires_at: data.expires_at,
    pending_response_count: data.pending_response_count,
  });
  const pending = responses.data?.filter((response) => response.status === 'pending') ?? [];
  const isAwaitingReview = isAwaitingReviewRequestView(data.status, data.expires_at);
  const isExpiredRequest = isExpiredRequestView(data.status, data.expires_at);
  const isOpen =
    (data.status === 'posted' || data.status === 'searching') &&
    !isAwaitingReview &&
    !isExpiredRequest;
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
            onSuccess: () => showAppToast('Request cancelled'),
          }),
      },
    ]);

  const canEdit = isRequestEditable({
    status: data.status,
    expires_at: data.expires_at,
    accepted_at: data.accepted_at,
    pending_response_count: data.pending_response_count,
    is_editable: data.is_editable,
  });

  const menuActions = isOpen
    ? [
        ...(canEdit
          ? [{ label: 'Edit Request', onPress: () => router.push(`/request/edit/${id}`) }]
          : []),
        { label: 'Cancel request', destructive: true, onPress: confirmCancel },
      ]
    : isAwaitingReview
      ? [{ label: 'Cancel request', destructive: true, onPress: confirmCancel }]
      : undefined;

  const openExtendDeadline = () => {
    setExtendDeadlineAt(addHours(new Date(), REQUEST_MAX_LIFETIME_HOURS));
    extendDeadlineSheetRef.current?.present();
  };

  const submitExtendDeadline = () => {
    if (extendDeadlineAt.getTime() <= Date.now() + 5 * 60 * 1000) {
      showAppToast('Choose a deadline at least 5 minutes from now.', 'warning');
      return;
    }

    extendRequest.mutate(extendDeadlineAt, {
      onSuccess: () => {
        extendDeadlineSheetRef.current?.dismiss();
        showAppToast('Request extended for new responses');
      },
    });
  };

  const confirmExpireRequest = () =>
    Alert.alert(
      'Close this request?',
      'It will stop accepting new responses. You can still view responses and history.',
      [
        { text: 'Keep open', style: 'cancel' },
        {
          text: 'Close request',
          style: 'destructive',
          onPress: () =>
            ownerExpireRequest.mutate(undefined, {
              onSuccess: () => showAppToast('Request closed'),
            }),
        },
      ],
    );

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <RequestMetaRow badgeLabel={badge.label} badgeTone={badge.tone} trailing={metaTime} />

        <RequestTitleSection title={data.title} description={data.description} />

        <RequestAttachmentSection attachmentPath={data.attachment_path} />

        {amount ? (
          <RequestOfferWhenCard
            amount={amount}
            whenLabel={formatWhenRequestCard(data.scheduled_for)}
            whenDetail={formatWhenHome(data.scheduled_for)}
            locationLabel={formatRequestOfferLocationLabel(data.location_label, null)}
          />
        ) : null}

        <RequestTagsLine slugs={data.tag_slugs} />

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

        {data.status === 'completed' ? (
          <RequestCompletionCard
            completedAtLabel={
              data.completed_at
                ? format(new Date(data.completed_at), "EEEE, d MMM 'at' h:mm a")
                : 'Completed'
            }
            ratingStars={data.my_rating_stars}
            ratingComment={data.my_rating_comment}
          />
        ) : null}

        {conversation.data ? (
          <RequestConnectionActions
            chatOnly
            onChat={() => router.push(`/conversation/${id}`)}
            onCall={() => {}}
            onViewMap={() => {}}
            callDisabled
          />
        ) : null}

        {reuseLabel && (data.status === 'completed' || isExpiredRequest) ? (
          <Button
            label={reuseLabel}
            size="lg"
            variant={data.status === 'completed' ? 'secondary' : 'primary'}
            onPress={() => router.push(`/request/new?from=${id}`)}
          />
        ) : null}

        {data.status === 'completed' || data.status === 'cancelled' || isExpiredRequest ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setReportIssueOpen(true)}
            className="items-center py-2 active:opacity-80"
          >
            <Text className="text-base font-semibold text-danger">Report an issue</Text>
          </Pressable>
        ) : null}

        {isAwaitingReview ? (
          <RequestCallout tone="warning" title="Awaiting review">
            <Text className="text-base text-muted">
              The response window ended. Review responses below, extend for more responses, or close
              the request.
            </Text>
          </RequestCallout>
        ) : null}

        {isExpiredRequest ? (
          <RequestCallout tone="warning" title="Expired">
            <Text className="text-base text-muted">
              Nobody was connected in time. Send a new one when you are ready.
            </Text>
          </RequestCallout>
        ) : null}

        {isAwaitingReview ? (
          <View className="flex-row gap-3">
            <Button
              label="Close request"
              variant="secondary"
              className="flex-1"
              size="lg"
              onPress={confirmExpireRequest}
              loading={ownerExpireRequest.isPending}
            />
            <Button
              label="Extend"
              className="flex-1"
              size="lg"
              onPress={openExtendDeadline}
              loading={extendRequest.isPending}
            />
          </View>
        ) : null}

        {isOpen || isAwaitingReview ? (
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

            {acceptResponse.isError &&
            acceptResponse.error &&
            !isInsufficientWalletBalanceError(acceptResponse.error) ? (
              <InlineError error={acceptResponse.error} />
            ) : null}

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
                onDiscussPress={() => discussResponse(response.response_id)}
                discussLoading={
                  openPreHandshakeChat.isPending &&
                  openPreHandshakeChat.variables === response.response_id
                }
              />
            ))}

            {cancelRequest.isError ? <InlineError error={cancelRequest.error} /> : null}
            {extendRequest.isError ? <InlineError error={extendRequest.error} /> : null}
            {ownerExpireRequest.isError ? (
              <InlineError error={ownerExpireRequest.error} />
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <ExtendResponseDeadlineSheet
        ref={extendDeadlineSheetRef}
        deadlineDateLabel={extendDeadlineDateLabel}
        deadlineTimeLabel={extendDeadlineTimeLabel}
        onRequestDatePicker={openExtendDatePicker}
        onRequestTimePicker={openExtendTimePicker}
        onDismiss={() => {
          if (!reopenExtendSheetAfterPickerRef.current) {
            setExtendIosPicker(null);
          }
        }}
        onExtend={submitExtendDeadline}
        extendLoading={extendRequest.isPending}
      />

      {extendIosPicker ? (
        <Modal
          transparent
          visible
          animationType="slide"
          onRequestClose={finishExtendPickerFlow}
        >
          <Pressable
            accessibilityRole="button"
            className="flex-1 justify-end bg-black/40"
            onPress={finishExtendPickerFlow}
          >
            <Pressable
              accessibilityRole="none"
              onPress={(event) => event.stopPropagation()}
              className="gap-4 rounded-t-3xl bg-surface px-5 pt-4"
              style={{ paddingBottom: safeInsets.bottom + 20 }}
            >
              <DateTimePicker
                value={extendIosPickerDraft}
                mode={extendIosPicker}
                display="spinner"
                minimumDate={extendIosPicker === 'date' ? new Date() : undefined}
                maximumDate={
                  extendIosPicker === 'date'
                    ? addHours(new Date(), REQUEST_MAX_LIFETIME_HOURS)
                    : undefined
                }
                onChange={(_, date) => {
                  if (date) setExtendIosPickerDraft(date);
                }}
              />
              <View className="flex-row gap-3">
                <Button
                  label="Cancel"
                  variant="secondary"
                  className="flex-1"
                  size="lg"
                  onPress={finishExtendPickerFlow}
                />
                <Button
                  label="Done"
                  className="flex-1"
                  size="lg"
                  onPress={confirmExtendIosPicker}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      <ReportIssueModal
        visible={reportIssueOpen}
        issues={REQUEST_REPORT_ISSUES}
        onClose={() => setReportIssueOpen(false)}
        onSubmit={() => {
          setReportIssueOpen(false);
          showAppToast('Thanks — we received your report');
        }}
      />

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
                          showAppToast('Declined');
                        },
                      },
                    ),
                  onAccept: () => {
                    const dialog = chooseResponderDialog(profilePreview.displayName);
                    Alert.alert(dialog.title, dialog.message, [
                      { text: dialog.cancel, style: 'cancel' },
                      {
                        text: dialog.confirm,
                        onPress: () => {
                          const responseId = profilePreview.pendingResponse!.responseId;
                          acceptResponder(responseId, () => {
                            profileSheetRef.current?.dismiss();
                            setProfilePreview(null);
                          });
                        },
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
