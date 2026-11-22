import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import {
  ProjectContributeSheet,
  type ProjectContributeInsufficientWalletPrompt,
  type ProjectContributeSheetHandle,
} from '@/components/project-flow/ProjectContributeSheet';
import { PersonProfileBottomSheet } from '@/components/PersonProfileBottomSheet';
import { InsufficientWalletSheet } from '@/components/request-flow/InsufficientWalletSheet';
import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { ProjectDetailTabs, type ProjectDetailTab } from '@/components/project-flow/ProjectDetailTabs';
import { ProjectResponseTabPanel } from '@/components/project-flow/ProjectResponseTabPanel';
import { ProjectResponsesPanel } from '@/components/project-flow/ProjectResponsesPanel';
import { ResponseCreationFlow } from '@/components/ResponseCreationFlow';
import { hasProfilePhotoReady } from '@/features/profile/api';
import { useWorkerProjectPreHandshakeConversation } from '@/features/projects/project-conversation-api';
import {
  projectResponseWizardInitialOffer,
  useProjectForRespond,
  useRespondToProject,
  useWithdrawProjectResponse,
} from '@/features/projects/project-responses-api';
import { showAppToast } from '@/lib/toast';
import { ProjectFundingCard } from '@/components/project-flow/ProjectFundingCard';
import { RequestAttachmentSection } from '@/components/request-flow/RequestAttachmentSection';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { RequestMetaRow } from '@/components/request-flow/RequestMetaRow';
import { RequestTagsLine } from '@/components/request-flow/RequestTagsLine';
import { RequestTitleSection } from '@/components/request-flow/RequestTitleSection';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { RequestDetailSkeleton } from '@/components/ui/content-skeletons';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { MARKET } from '@/config';
import {
  useProject,
  useProjectActivity,
  useProjectResponses,
} from '@/features/projects/project-api';
import { projectCreatorProfileFields } from '@/features/projects/project-creator-profile';
import { projectViewerMayViewAssignments } from '@/features/projects/project-assignments-visibility';
import {
  projectContributionRemainingMajor,
  projectViewerMayContribute,
} from '@/features/projects/project-contribute';
import { projectDetailBadge } from '@/features/projects/project-status';
import { useProfile } from '@/features/profile/api';
import {
  formatAgo,
  formatCoarseLocationLabel,
  formatMoney,
  formatWhenHome,
} from '@/lib/format';
import { usePullToRefresh } from '@/lib/query/use-pull-to-refresh';
import { useMyWallet } from '@/features/wallet/api';
import { openWalletTopUp } from '@/features/wallet/top-up';

function koboToMajor(kobo: number) {
  return kobo / 100;
}

function fundingProgress(contributed: number, budget: number, minTarget: number) {
  const pctBudget = budget > 0 ? Math.min(100, Math.round((contributed / budget) * 100)) : 0;
  const metMin = contributed >= minTarget;
  return { pctBudget, metMin };
}

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<ProjectDetailTab>('activity');
  const defaultTabSet = useRef(false);
  const listRef = useRef<FlatList | null>(null);
  const [inFlow, setInFlow] = useState(false);
  const [flowStep, setFlowStep] = useState(0);
  const [flowKey, setFlowKey] = useState(0);
  const [needsPhotoStep, setNeedsPhotoStep] = useState(false);
  const [insufficientWalletPrompt, setInsufficientWalletPrompt] =
    useState<ProjectContributeInsufficientWalletPrompt | null>(null);
  const contributeSheetRef = useRef<ProjectContributeSheetHandle>(null);
  const creatorProfileSheetRef = useRef<BottomSheetModal>(null);

  const project = useProject(projectId);
  const {
    request: respondable,
    existingResponse,
    respondAllowed,
    isPending: respondMetaPending,
  } = useProjectForRespond(projectId);
  const respond = useRespondToProject();
  const withdraw = useWithdrawProjectResponse();
  const wallet = useMyWallet();
  const mayViewAssignments = Boolean(
    project.data && projectViewerMayViewAssignments(project.data),
  );
  const projectResponses = useProjectResponses(projectId, { enabled: mayViewAssignments });
  const activity = useProjectActivity(projectId);
  const profile = useProfile();
  const detail = project.data;
  const workerPreHandshakeChat = useWorkerProjectPreHandshakeConversation(
    projectId,
    Boolean(detail && !detail.viewer_is_creator && existingResponse),
  );
  const showAssignmentsTabFromData = Boolean(
    detail && projectViewerMayViewAssignments(detail),
  );

  const showResponseTab = Boolean(detail && !detail.viewer_is_creator);

  useEffect(() => {
    if (!detail || defaultTabSet.current) return;
    defaultTabSet.current = true;
    if (!detail.viewer_is_creator) {
      setTab('response');
    } else if (showAssignmentsTabFromData) {
      setTab('assignments');
    }
  }, [detail, showAssignmentsTabFromData]);

  useEffect(() => {
    if (!showAssignmentsTabFromData && tab === 'assignments') {
      setTab(showResponseTab ? 'response' : 'activity');
    }
    if (!showResponseTab && tab === 'response') {
      setTab('activity');
    }
  }, [showAssignmentsTabFromData, showResponseTab, tab]);

  const creatorUsername =
    detail && profile.data?.id === detail.creator_id ? profile.data.username ?? null : null;

  const refetchAll = useCallback(async () => {
    await Promise.all([
      project.refetch(),
      projectResponses.refetch(),
      activity.refetch(),
    ]);
  }, [activity.refetch, project.refetch, projectResponses.refetch]);

  const { refreshing, onRefresh } = usePullToRefresh(refetchAll);

  const progress = useMemo(() => {
    if (!detail) return null;
    return fundingProgress(
      detail.contributed_total_kobo,
      detail.budget_total_kobo,
      detail.min_funding_target_kobo,
    );
  }, [detail]);

  const canContribute = Boolean(detail && projectViewerMayContribute(detail));

  const headerTitle = detail?.viewer_is_creator ? 'Your project' : 'Project';
  const budgetMajor = detail ? detail.budget_total_kobo / 100 : 0;

  const initialOfferInput = useMemo(
    () => projectResponseWizardInitialOffer(existingResponse?.quotedAmount, budgetMajor),
    [existingResponse?.quotedAmount, budgetMajor],
  );
  const initialMessage = existingResponse?.message ?? '';

  const beginFlow = useCallback(() => {
    if (!respondable) return;
    respond.reset();
    setNeedsPhotoStep(!hasProfilePhotoReady(profile.data));
    setFlowStep(0);
    setFlowKey((k) => k + 1);
    setInFlow(true);
  }, [profile.data, respond, respondable]);

  const exitFlow = () => {
    setInFlow(false);
    setFlowStep(0);
  };

  const submitResponse = (payload: {
    message: string | null;
    quotedAmount: number | null;
    proposedDeliveryDurationValue: number;
    proposedDeliveryDurationUnit: import('@/features/requests/delivery-duration').DeliveryDurationUnit;
  }) => {
    const compensation = payload.quotedAmount ?? (budgetMajor > 0 ? budgetMajor : null);
    if (compensation === null || compensation <= 0) {
      showAppToast('Enter a valid compensation amount.', 'warning');
      return;
    }
    respond.mutate(
      {
        projectId,
        message: payload.message,
        compensationMajor: compensation,
        proposedDeliveryDurationValue: payload.proposedDeliveryDurationValue,
        proposedDeliveryDurationUnit: payload.proposedDeliveryDurationUnit,
      },
      {
        onSuccess: () => {
          exitFlow();
          setTab('response');
          showAppToast(existingResponse ? 'Response updated' : 'Response sent');
        },
      },
    );
  };

  const confirmWithdraw = () => {
    Alert.alert(
      'Cancel response?',
      'You can respond again later if the project is still open.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel response',
          style: 'destructive',
          onPress: () =>
            withdraw.mutate(projectId, {
              onSuccess: () => showAppToast('Response cancelled'),
            }),
        },
      ],
    );
  };

  if (project.isPending || (showResponseTab && respondMetaPending)) {
    return (
      <Screen className="flex-1">
        <RequestFlowHeader title={headerTitle} onBack={() => router.back()} />
        <RequestDetailSkeleton />
      </Screen>
    );
  }

  if (project.isError) {
    return (
      <Screen className="flex-1">
        <RequestFlowHeader title="Project" onBack={() => router.back()} />
        <View className="px-5 pt-4">
          <InlineError error={project.error} onRetry={() => void project.refetch()} />
        </View>
      </Screen>
    );
  }

  if (!detail) {
    return (
      <Screen className="flex-1">
        <RequestFlowHeader title="Project" onBack={() => router.back()} />
        <EmptyState
          layout="list"
          icon="lock-closed-outline"
          title="Project unavailable"
          message="This project may be private, invite-only, or restricted."
        />
      </Screen>
    );
  }

  const badge = projectDetailBadge({
    status: detail.status,
    funding_status: detail.funding_status,
  });
  const metaTime = formatAgo(
    detail.funding_opened_at ?? detail.funding_deadline_at ?? new Date().toISOString(),
  );
  const locationLabel = detail.location_label
    ? formatCoarseLocationLabel(detail.location_label)
    : 'Not set';

  const creatorProfile = projectCreatorProfileFields(detail);
  const showAssignmentsTab = showAssignmentsTabFromData;

  if (inFlow && respondable) {
    return (
      <Screen className="flex-1">
        <ResponseCreationFlow
          key={flowKey}
          step={flowStep}
          onStepChange={setFlowStep}
          onExit={exitFlow}
          request={respondable}
          initialYourOffer={initialOfferInput}
          initialMessage={initialMessage}
          initialProposedDeliveryDurationValue={existingResponse?.proposedDeliveryDurationValue}
          initialProposedDeliveryDurationUnit={existingResponse?.proposedDeliveryDurationUnit}
          needsPhotoStep={needsPhotoStep}
          isUpdate={Boolean(existingResponse)}
          submitting={respond.isPending}
          submitError={respond.error}
          onSubmit={submitResponse}
        />
      </Screen>
    );
  }

  const activeQuery = activity;

  const listData = useMemo(() => {
    if (tab === 'response' || tab === 'assignments') return [];
    if (activeQuery.isPending || activeQuery.isError) return [];
    return activeQuery.data ?? [];
  }, [
    activeQuery.data,
    activeQuery.isError,
    activeQuery.isPending,
    showAssignmentsTab,
    tab,
  ]);

  const listHeader = useMemo(
    () => (
      <View className="gap-5 pb-2">
        <RequestMetaRow badgeLabel={badge.label} badgeTone={badge.tone} trailing={metaTime} />

        <RequestTitleSection title={detail.title} description={detail.description} />

        <RequestAttachmentSection attachmentPath={detail.attachment_path} />

        {progress ? (
          <ProjectFundingCard
            budgetLabel={formatMoney(koboToMajor(detail.budget_total_kobo), MARKET.currency)}
            contributedLabel={formatMoney(koboToMajor(detail.contributed_total_kobo), MARKET.currency)}
            progressPct={progress.pctBudget}
            minTargetLabel={formatMoney(koboToMajor(detail.min_funding_target_kobo), MARKET.currency)}
            minTargetMet={progress.metMin}
            whenLabel={
              detail.funding_deadline_at
                ? formatWhenHome(detail.funding_deadline_at)
                : 'Not set'
            }
            locationLabel={locationLabel}
            fundingStatusLabel={detail.funding_status}
            onOpenContribute={
              canContribute ? () => contributeSheetRef.current?.present() : undefined
            }
          />
        ) : null}

        <RequestTagsLine slugs={detail.tag_slugs} />

        {!detail.viewer_is_creator && detail.creator_display_name ? (
          <RequestPersonCard
            avatarPath={detail.creator_avatar_path}
            name={detail.creator_display_name}
            ratingAverage={creatorProfile.ratingAverage}
            ratingCount={creatorProfile.ratingCount}
            completionPercent={creatorProfile.completionPercent}
            identityVerified={creatorProfile.identityVerified}
            onPress={() => creatorProfileSheetRef.current?.present()}
            onDiscussPress={
              existingResponse && workerPreHandshakeChat.data
                ? () => router.push(`/conversation/${workerPreHandshakeChat.data}` as Href)
                : undefined
            }
            discussLoading={workerPreHandshakeChat.isPending}
          />
        ) : null}

        {creatorUsername ? (
          <Pressable onPress={() => router.push(`/u/${creatorUsername}` as Href)} className="py-1">
            <Text className="text-base font-semibold text-brand">View your public profile</Text>
          </Pressable>
        ) : null}

        <ProjectDetailTabs
          active={tab}
          onChange={setTab}
          showAssignments={showAssignmentsTab}
          showResponse={showResponseTab}
        />

        {tab === 'response' && showResponseTab ? (
          <ProjectResponseTabPanel
            budgetMajor={budgetMajor}
            existingResponse={existingResponse}
            respondAllowed={respondAllowed}
            respondError={respond.error}
            withdrawError={withdraw.error}
            withdrawLoading={withdraw.isPending}
            onBeginRespond={beginFlow}
            onEditResponse={beginFlow}
            onCancelResponse={confirmWithdraw}
          />
        ) : null}

        {tab === 'assignments' && showAssignmentsTab ? (
          <ProjectResponsesPanel
            responses={projectResponses}
            allowDiscuss={Boolean(detail.viewer_is_creator)}
          />
        ) : null}
      </View>
    ),
    [
      badge.label,
      badge.tone,
      canContribute,
      creatorProfile,
      creatorUsername,
      detail.attachment_path,
      detail.creator_avatar_path,
      detail.creator_display_name,
      detail.description,
      detail.funding_deadline_at,
      detail.funding_status,
      detail.tag_slugs,
      detail.title,
      detail.viewer_is_creator,
      detail.viewer_is_contributor,
      locationLabel,
      showAssignmentsTab,
      showResponseTab,
      existingResponse,
      workerPreHandshakeChat.data,
      workerPreHandshakeChat.isPending,
      respondAllowed,
      respond.error,
      withdraw.error,
      withdraw.isPending,
      beginFlow,
      budgetMajor,
      metaTime,
      progress,
      projectId,
      projectResponses,
      tab,
    ],
  );

  const keyExtractor = useCallback(
    (item: (typeof listData)[number], index: number) => {
      return `activity-${index}`;
    },
    [tab],
  );

  return (
    <Screen className="relative flex-1" edges={['top', 'bottom']}>
      <RequestFlowHeader title={headerTitle} onBack={() => router.back()} />

      <View className="min-h-0 flex-1">
        <FlatList
          ref={listRef}
          key={tab}
          data={listData}
          keyExtractor={keyExtractor}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{
            gap: 12,
            paddingHorizontal: 20,
            paddingBottom: 48,
            flexGrow: listData.length === 0 ? 1 : undefined,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            tab === 'response' || tab === 'assignments' ? (
              <View />
            ) : (
              <View className="min-h-[200px] justify-center">
                <ProjectDetailTabEmpty
                  tab={tab}
                  query={activeQuery}
                  showAssignmentsTab={showAssignmentsTab}
                />
              </View>
            )
          }
          renderItem={({ item }) => <ProjectDetailTabRow tab={tab} item={item} />}
        />
      </View>

      <PersonProfileBottomSheet
        sheetRef={creatorProfileSheetRef}
        userId={detail.creator_id}
        displayName={detail.creator_display_name}
        avatarPath={detail.creator_avatar_path}
        bio={detail.creator_bio}
        ratingAverage={creatorProfile.ratingAverage}
        ratingCount={creatorProfile.ratingCount}
        completionPercent={creatorProfile.completionPercent}
        identityVerified={creatorProfile.identityVerified}
      />

      <ProjectContributeSheet
        ref={contributeSheetRef}
        projectId={projectId}
        minContributionMajor={koboToMajor(detail.min_contribution_kobo)}
        maxContributionMajor={projectContributionRemainingMajor(
          detail.budget_total_kobo,
          detail.contributed_total_kobo,
        )}
        projectTitle={detail.title}
        onInsufficientWallet={setInsufficientWalletPrompt}
      />

      <InsufficientWalletSheet
        open={insufficientWalletPrompt !== null}
        message={insufficientWalletPrompt?.message ?? ''}
        onClose={() => setInsufficientWalletPrompt(null)}
        onAddMoney={() => {
          const prompt = insufficientWalletPrompt;
          if (!prompt) return;
          setInsufficientWalletPrompt(null);
          openWalletTopUp({
            returnTo: `/project/${projectId}`,
            requiredLockMajor: prompt.requiredLockMajor,
            availableMajor: wallet.data?.available ?? 0,
          });
        }}
      />
    </Screen>
  );
}

type TabQuery = ReturnType<typeof useProjectActivity>;

function ProjectDetailTabEmpty({
  tab,
  query,
  showAssignmentsTab,
}: {
  tab: ProjectDetailTab;
  query: TabQuery;
  showAssignmentsTab: boolean;
}) {
  if (query.isPending) {
    return <SkeletonBlock className="h-20 w-full rounded-2xl" />;
  }
  if (query.isError) {
    return <InlineError error={query.error} onRetry={() => void query.refetch()} />;
  }
  return (
    <EmptyState
      layout="list"
      icon="time-outline"
      title="No activity yet"
      message="Contributions, funding milestones, and other updates appear here."
    />
  );
}

function ProjectDetailTabRow({
  tab,
  item,
}: {
  tab: ProjectDetailTab;
  item: Record<string, unknown>;
}) {
  if (tab === 'activity' && 'summary' in item) {
    const row = item as { summary: string; event_at: string | null; event_type: string };
    return (
      <View className="flex-row gap-3 rounded-2xl border border-hairline bg-elevated px-4 py-3">
        <View className="mt-0.5 h-2 w-2 rounded-full bg-brand" />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base font-medium text-ink">{row.summary}</Text>
          {row.event_at ? (
            <Text className="text-xs text-muted">{formatWhenHome(row.event_at)}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  return null;
}