import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
import { ProjectFundingCard } from '@/components/project-flow/ProjectFundingCard';
import { RequestAttachmentSection } from '@/components/request-flow/RequestAttachmentSection';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { RequestMetaRow } from '@/components/request-flow/RequestMetaRow';
import { RequestTagsLine } from '@/components/request-flow/RequestTagsLine';
import { RequestTitleSection } from '@/components/request-flow/RequestTitleSection';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { RequestDetailSkeleton } from '@/components/ui/content-skeletons';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { MARKET } from '@/config';
import {
  useProject,
  useProjectActivity,
  useProjectAssignments,
  useProjectContributions,
} from '@/features/projects/project-api';
import { projectCreatorProfileFields } from '@/features/projects/project-creator-profile';
import { projectViewerMayViewAssignments } from '@/features/projects/project-assignments-visibility';
import { projectViewerMayContribute } from '@/features/projects/project-contribute';
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
import { useColors } from '@/theme';

function koboToMajor(kobo: number) {
  return kobo / 100;
}

function fundingProgress(contributed: number, budget: number, minTarget: number) {
  const pctBudget = budget > 0 ? Math.min(100, Math.round((contributed / budget) * 100)) : 0;
  const metMin = contributed >= minTarget;
  return { pctBudget, metMin };
}

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<ProjectDetailTab>('contributions');
  const [insufficientWalletPrompt, setInsufficientWalletPrompt] =
    useState<ProjectContributeInsufficientWalletPrompt | null>(null);
  const contributeSheetRef = useRef<ProjectContributeSheetHandle>(null);
  const creatorProfileSheetRef = useRef<BottomSheetModal>(null);

  const project = useProject(projectId);
  const wallet = useMyWallet();
  const mayViewAssignments = Boolean(
    project.data && projectViewerMayViewAssignments(project.data),
  );
  const assignments = useProjectAssignments(projectId, { enabled: mayViewAssignments });
  const contributions = useProjectContributions(projectId);
  const activity = useProjectActivity(projectId);
  const profile = useProfile();
  const detail = project.data;
  const creatorUsername =
    detail && profile.data?.id === detail.creator_id ? profile.data.username ?? null : null;

  const refetchAll = useCallback(async () => {
    await Promise.all([
      project.refetch(),
      assignments.refetch(),
      contributions.refetch(),
      activity.refetch(),
    ]);
  }, [activity.refetch, assignments.refetch, contributions.refetch, project.refetch]);

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

  if (project.isPending) {
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
  const showAssignmentsTab = projectViewerMayViewAssignments(detail);
  const showRespondFooter = !detail.viewer_is_creator;
  const activeQuery =
    tab === 'contributions'
      ? contributions
      : tab === 'assignments' && showAssignmentsTab
        ? assignments
        : tab === 'activity'
          ? activity
          : contributions;

  const listData = useMemo(() => {
    if (tab === 'assignments' && !showAssignmentsTab) return [];
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
        />
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
      metaTime,
      progress,
      tab,
    ],
  );

  const keyExtractor = useCallback(
    (item: (typeof listData)[number], index: number) => {
      if (tab === 'contributions' && 'contribution_id' in item) return item.contribution_id;
      if (tab === 'assignments' && 'assignment_id' in item) return item.assignment_id;
      return `activity-${index}`;
    },
    [tab],
  );

  return (
    <Screen className="relative flex-1" edges={['top', 'bottom']}>
      <RequestFlowHeader title={headerTitle} onBack={() => router.back()} />

      <View className="min-h-0 flex-1">
        <FlatList
          key={tab}
          data={listData}
          keyExtractor={keyExtractor}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{
            gap: 12,
            paddingHorizontal: 20,
            paddingBottom: showRespondFooter ? 112 : 48,
            flexGrow: listData.length === 0 ? 1 : undefined,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View className="min-h-[200px] justify-center">
              <ProjectDetailTabEmpty
                tab={tab}
                query={activeQuery}
                showAssignmentsTab={showAssignmentsTab}
              />
            </View>
          }
          renderItem={({ item }) => <ProjectDetailTabRow tab={tab} item={item} />}
        />
      </View>

      {showRespondFooter ? (
        <View className="absolute bottom-0 left-0 right-0 items-center px-5 pb-2">
          <View className="w-full max-w-md">
            <Button
              label="Respond to project"
              variant="active"
              size="lg"
              corner="2xl"
              onPress={() => setTab('assignments')}
            />
          </View>
        </View>
      ) : null}

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

type TabQuery =
  | ReturnType<typeof useProjectContributions>
  | ReturnType<typeof useProjectAssignments>
  | ReturnType<typeof useProjectActivity>;

function ProjectDetailTabEmpty({
  tab,
  query,
  showAssignmentsTab,
}: {
  tab: ProjectDetailTab;
  query: TabQuery;
  showAssignmentsTab: boolean;
}) {
  if (tab === 'assignments' && !showAssignmentsTab) {
    return (
      <EmptyState
        layout="list"
        icon="briefcase-outline"
        title="Respond to this project"
        message="Assignment openings will appear here when you respond. Full assignment management is only visible to the creator and contributors."
      />
    );
  }

  if (query.isPending) {
    return <SkeletonBlock className="h-20 w-full rounded-2xl" />;
  }
  if (query.isError) {
    return <InlineError error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (tab === 'contributions') {
    return (
      <EmptyState
        layout="list"
        icon="wallet-outline"
        title="No contributions yet"
        message="Pool contributions will show up here."
      />
    );
  }
  if (tab === 'assignments') {
    return (
      <EmptyState
        layout="list"
        icon="briefcase-outline"
        title="No assignments"
        message="Work packages and roles for this project appear here."
      />
    );
  }
  return (
    <EmptyState
      layout="list"
      icon="time-outline"
      title="No activity yet"
      message="Funding and project milestones will appear here."
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
  const colors = useColors();

  if (tab === 'contributions' && 'contribution_id' in item) {
    const row = item as {
      contribution_id: string;
      contributor_display_name: string | null;
      amount_kobo: number;
      contributed_at: string | null;
      viewer_is_self: boolean;
    };
    return (
      <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-hairline bg-elevated px-4 py-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base font-semibold text-ink" numberOfLines={1}>
            {row.viewer_is_self ? 'You' : row.contributor_display_name?.trim() || 'Contributor'}
          </Text>
          {row.contributed_at ? (
            <Text className="text-xs text-muted">{formatWhenHome(row.contributed_at)}</Text>
          ) : null}
        </View>
        <Text className="shrink-0 text-base font-bold text-ink">
          {formatMoney(koboToMajor(row.amount_kobo), MARKET.currency)}
        </Text>
      </View>
    );
  }

  if (tab === 'assignments' && 'assignment_id' in item) {
    const row = item as {
      assignment_id: string;
      title: string;
      status: string;
      compensation_total_kobo: number;
      reservation_secured: boolean;
    };
    return (
      <Pressable
        onPress={() => router.push(`/project/assignment/${row.assignment_id}` as Href)}
        className="flex-row items-center gap-3 rounded-2xl border border-hairline bg-elevated px-4 py-3 active:opacity-90"
      >
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-base font-semibold text-ink" numberOfLines={1}>
            {row.title}
          </Text>
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge label={row.status.replaceAll('_', ' ')} tone="neutral" dot={false} />
            <Text className="text-sm text-muted">
              {formatMoney(koboToMajor(row.compensation_total_kobo), MARKET.currency)}
            </Text>
          </View>
          <Text className="text-xs text-subtle">
            {row.reservation_secured ? 'Compensation secured' : 'Awaiting reserve'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
      </Pressable>
    );
  }

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