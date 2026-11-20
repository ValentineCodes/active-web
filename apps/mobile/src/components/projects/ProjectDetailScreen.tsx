import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { ProjectFundingCard } from '@/components/project-flow/ProjectFundingCard';
import { RequestAttachmentSection } from '@/components/request-flow/RequestAttachmentSection';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
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
  useContributeToProject,
  useOpenProjectFunding,
  useProject,
  useProjectActivity,
  useProjectAssignments,
  useProjectContributions,
} from '@/features/projects/project-api';
import { projectDetailBadge } from '@/features/projects/project-status';
import { useProfile } from '@/features/profile/api';
import { formatMoney, formatWhenHome, formatWhenRequestCard } from '@/lib/format';
import { usePullToRefresh } from '@/lib/query/use-pull-to-refresh';
import { showAppToast } from '@/lib/toast';

function koboToMajor(kobo: number) {
  return kobo / 100;
}

function fundingProgress(contributed: number, budget: number, minTarget: number) {
  const pctBudget = budget > 0 ? Math.min(100, Math.round((contributed / budget) * 100)) : 0;
  const metMin = contributed >= minTarget;
  return { pctBudget, metMin };
}

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const [contributeAmount, setContributeAmount] = useState('');

  const project = useProject(projectId);
  const assignments = useProjectAssignments(projectId);
  const contributions = useProjectContributions(projectId);
  const activity = useProjectActivity(projectId);
  const profile = useProfile();
  const openFunding = useOpenProjectFunding();
  const contribute = useContributeToProject();

  const detail = project.data;
  const creatorUsername =
    detail && profile.data?.id === detail.creator_id
      ? profile.data.username ?? null
      : null;

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

  const canContribute =
    Boolean(detail && !detail.viewer_is_creator && detail.funding_status === 'open');

  const handlePublish = useCallback(() => {
    openFunding.mutate(projectId, {
      onSuccess: () => showAppToast('Funding is open', { type: 'success' }),
      onError: (error) =>
        showAppToast(error instanceof Error ? error.message : 'Could not open funding', 'warning'),
    });
  }, [openFunding, projectId]);

  const handleContribute = useCallback(() => {
    const major = Number(contributeAmount.replace(/[^\d.]/g, ''));
    if (!major || Number.isNaN(major)) {
      showAppToast('Enter a contribution amount', 'warning');
      return;
    }
    contribute.mutate(
      { projectId, amountMajor: major },
      {
        onSuccess: () => {
          setContributeAmount('');
          showAppToast('Contribution recorded', { type: 'success' });
        },
        onError: (error) =>
          showAppToast(
            error instanceof Error ? error.message : 'Could not contribute',
            'warning',
          ),
      },
    );
  }, [contribute, contributeAmount, projectId]);

  const headerTitle = detail?.viewer_is_creator ? 'Your project' : 'Project';

  if (project.isPending) {
    return (
      <Screen>
        <RequestFlowHeader title={headerTitle} onBack={() => router.back()} />
        <RequestDetailSkeleton />
      </Screen>
    );
  }

  if (project.isError) {
    return (
      <Screen>
        <RequestFlowHeader title="Project" onBack={() => router.back()} />
        <View className="px-5">
          <InlineError error={project.error} onRetry={() => void project.refetch()} />
        </View>
      </Screen>
    );
  }

  if (!detail) {
    return (
      <Screen>
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
  const metaTime = detail.funding_opened_at
    ? formatWhenHome(detail.funding_opened_at)
    : detail.funding_deadline_at
      ? formatWhenHome(detail.funding_deadline_at)
      : 'Recently';

  return (
    <Screen>
      <RequestFlowHeader title={headerTitle} onBack={() => router.back()} />

      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-12"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <RequestMetaRow badgeLabel={badge.label} badgeTone={badge.tone} trailing={metaTime} />

        <RequestTitleSection title={detail.title} description={detail.description} />

        <RequestAttachmentSection attachmentPath={detail.attachment_path} />

        {progress ? (
          <ProjectFundingCard
            budgetLabel={formatMoney(koboToMajor(detail.budget_total_kobo), MARKET.currency)}
            contributedLabel={formatMoney(koboToMajor(detail.contributed_total_kobo), MARKET.currency)}
            deadlineLabel={
              detail.funding_deadline_at
                ? formatWhenRequestCard(detail.funding_deadline_at)
                : 'No deadline'
            }
            deadlineDetail={
              detail.funding_deadline_at
                ? formatWhenHome(detail.funding_deadline_at)
                : 'Not set'
            }
            fundingStatusLabel={detail.funding_status.replaceAll('_', ' ')}
            progressPct={progress.pctBudget}
            minTargetLabel={formatMoney(koboToMajor(detail.min_funding_target_kobo), MARKET.currency)}
            minTargetMet={progress.metMin}
          />
        ) : null}

        <RequestTagsLine slugs={detail.tag_slugs} />

        {detail.status === 'draft' ? (
          <RequestCallout tone="info" title="Draft project">
            <Text className="text-sm text-muted">
              Publish to open the funding pool. Collaborators can contribute after you publish.
            </Text>
          </RequestCallout>
        ) : null}

        {detail.viewer_is_creator && detail.status === 'draft' ? (
          <Button
            label={openFunding.isPending ? 'Publishing…' : 'Publish & open funding'}
            size="lg"
            onPress={handlePublish}
            loading={openFunding.isPending}
          />
        ) : null}

        {canContribute ? (
          <View className="gap-3 rounded-2xl border border-hairline bg-elevated p-4">
            <Text className="text-lg font-bold text-ink">Contribute to the pool</Text>
            <Text className="text-sm text-muted">
              Minimum {formatMoney(koboToMajor(detail.min_contribution_kobo), MARKET.currency)}
            </Text>
            <TextInput
              value={contributeAmount}
              onChangeText={setContributeAmount}
              keyboardType="numeric"
              placeholder="Amount"
              placeholderTextColor="#888"
              className="rounded-xl bg-surface px-4 py-3 text-base text-ink"
            />
            <Button
              label={contribute.isPending ? 'Contributing…' : 'Contribute'}
              variant="active"
              size="lg"
              onPress={handleContribute}
              loading={contribute.isPending}
            />
          </View>
        ) : null}

        {creatorUsername ? (
          <Pressable onPress={() => router.push(`/u/${creatorUsername}` as Href)} className="py-1">
            <Text className="text-base font-semibold text-brand">View your public profile</Text>
          </Pressable>
        ) : null}

        <View className="gap-3">
          <Text className="text-lg font-bold text-ink">Contributions</Text>
          {contributions.isPending ? (
            <SkeletonBlock className="h-16 w-full rounded-2xl" />
          ) : contributions.isError ? (
            <InlineError error={contributions.error} onRetry={() => void contributions.refetch()} />
          ) : (contributions.data?.length ?? 0) === 0 ? (
            <EmptyState
              layout="list"
              icon="wallet-outline"
              title="No contributions yet"
              message="Contributions you can see will appear here."
            />
          ) : (
            contributions.data?.map((row) => (
              <View key={row.contribution_id} className="rounded-2xl bg-surface p-4">
                <Text className="text-base font-bold text-ink">
                  {formatMoney(koboToMajor(row.amount_kobo), MARKET.currency)}
                </Text>
                <Text className="text-sm text-muted">
                  {row.viewer_is_self
                    ? 'Your contribution'
                    : (row.contributor_display_name ?? 'Contributor')}
                </Text>
                {row.viewer_is_creator || row.viewer_is_self ? (
                  <Text className="text-xs text-subtle">
                    Reserved {formatMoney(koboToMajor(row.reserved_kobo), MARKET.currency)}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold text-ink">Assignments</Text>
          {assignments.isPending ? (
            <SkeletonBlock className="h-16 w-full rounded-2xl" />
          ) : assignments.isError ? (
            <InlineError error={assignments.error} onRetry={() => void assignments.refetch()} />
          ) : (assignments.data?.length ?? 0) === 0 ? (
            <EmptyState
              layout="list"
              icon="briefcase-outline"
              title="No assignments"
              message="Assignments for this project appear here."
            />
          ) : (
            assignments.data?.map((row) => (
              <Pressable
                key={row.assignment_id}
                onPress={() => router.push(`/project/assignment/${row.assignment_id}` as Href)}
                className="rounded-2xl bg-surface p-4 active:opacity-90"
              >
                <Text className="text-base font-semibold text-ink">{row.title}</Text>
                <Text className="text-sm capitalize text-muted">{row.status.replaceAll('_', ' ')}</Text>
                <Text className="text-sm text-muted">
                  {formatMoney(koboToMajor(row.compensation_total_kobo), MARKET.currency)}
                  {row.reservation_secured ? ' · secured' : ' · awaiting reserve'}
                </Text>
              </Pressable>
            ))
          )}
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold text-ink">Activity</Text>
          {activity.isPending ? (
            <SkeletonBlock className="h-12 w-full rounded-2xl" />
          ) : activity.isError ? (
            <InlineError error={activity.error} onRetry={() => void activity.refetch()} />
          ) : (activity.data?.length ?? 0) === 0 ? (
            <EmptyState
              layout="list"
              icon="time-outline"
              title="No activity yet"
              message="Meaningful project events appear here."
            />
          ) : (
            activity.data?.map((row, index) => (
              <View key={`${row.event_type}-${index}`} className="rounded-2xl bg-surface p-4">
                <Text className="text-base font-medium text-ink">{row.summary}</Text>
                {row.event_at ? (
                  <Text className="text-xs text-muted">{formatWhenHome(row.event_at)}</Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}