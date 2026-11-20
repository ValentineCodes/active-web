'use client';

import { useMemo } from 'react';
import { useRouter } from '@/lib/navigation';

import { ProjectFundingCard } from '@/components/project-flow/ProjectFundingCard';
import { RequestAttachmentSection } from '@/components/request-flow/RequestAttachmentSection';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { RequestMetaRow } from '@/components/request-flow/RequestMetaRow';
import { RequestTagsLine } from '@/components/request-flow/RequestTagsLine';
import { RequestTitleSection } from '@/components/request-flow/RequestTitleSection';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { MARKET } from '@/config';
import { useOpenProjectFunding, useProject } from '@/features/projects/project-api';
import { projectDetailBadge } from '@/features/projects/project-status';
import { formatMoney, formatWhenHome, formatWhenRequestCard } from '@/lib/format';
import { useRouteParam } from '@/lib/route-param';
import { showAppToast } from '@/lib/toast';

function koboToMajor(kobo: number) {
  return kobo / 100;
}

function fundingProgress(contributed: number, budget: number, minTarget: number) {
  const pctBudget = budget > 0 ? Math.min(100, Math.round((contributed / budget) * 100)) : 0;
  const metMin = contributed >= minTarget;
  return { pctBudget, metMin };
}

export function ProjectDetailPage() {
  const router = useRouter();
  const id = useRouteParam('id');
  const project = useProject(id);
  const openFunding = useOpenProjectFunding();

  const detail = project.data;
  const headerTitle = detail?.viewer_is_creator ? 'Your project' : 'Project';

  const progress = useMemo(() => {
    if (!detail) return null;
    return fundingProgress(
      detail.contributed_total_kobo,
      detail.budget_total_kobo,
      detail.min_funding_target_kobo,
    );
  }, [detail]);

  if (project.isPending) {
    return (
      <Screen className="flex min-h-0 flex-1 flex-col">
        <RequestFlowHeader title={headerTitle} onBack={() => router.back()} />
        <LoadingState label="Loading project…" />
      </Screen>
    );
  }

  if (project.isError) {
    return (
      <Screen className="flex min-h-0 flex-1 flex-col">
        <RequestFlowHeader title="Project" onBack={() => router.back()} />
        <div className="px-5">
          <InlineError error={project.error} onRetry={() => void project.refetch()} />
        </div>
      </Screen>
    );
  }

  if (!detail) {
    return (
      <Screen className="flex min-h-0 flex-1 flex-col">
        <RequestFlowHeader title="Project" onBack={() => router.back()} />
        <EmptyState
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
    <Screen className="flex min-h-0 flex-1 flex-col">
      <RequestFlowHeader title={headerTitle} onBack={() => router.back()} />

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-5 pb-12">
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
            <p className="text-sm text-muted">
              Publish to open the funding pool. Collaborators can contribute after you publish.
            </p>
          </RequestCallout>
        ) : null}

        {detail.viewer_is_creator && detail.status === 'draft' ? (
          <Button
            label={openFunding.isPending ? 'Publishing…' : 'Publish & open funding'}
            loading={openFunding.isPending}
            onClick={() => {
              openFunding.mutate(id, {
                onSuccess: () => showAppToast('Funding is open', { type: 'success' }),
                onError: (error) =>
                  showAppToast(
                    error instanceof Error ? error.message : 'Could not open funding',
                    'warning',
                  ),
              });
            }}
          />
        ) : null}
      </div>
    </Screen>
  );
}