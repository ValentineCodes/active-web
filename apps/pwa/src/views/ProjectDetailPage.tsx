'use client';

import { useMemo, useState } from 'react';
import { useRouter } from '@/lib/navigation';

import {
  PersonProfileSheet,
  type PersonProfilePreview,
} from '@/components/profile/PersonProfileSheet';
import { ProjectContributeModal } from '@/components/project-flow/ProjectContributeModal';
import {
  ProjectActivityPanel,
  ProjectAssignmentsPanel,
  ProjectContributionsPanel,
} from '@/components/project-flow/ProjectDetailTabPanels';
import { ProjectDetailTabs, type ProjectDetailTab } from '@/components/project-flow/ProjectDetailTabs';
import { ProjectFundingCard } from '@/components/project-flow/ProjectFundingCard';
import { RequestAttachmentSection } from '@/components/request-flow/RequestAttachmentSection';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { RequestMetaRow } from '@/components/request-flow/RequestMetaRow';
import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { RequestTagsLine } from '@/components/request-flow/RequestTagsLine';
import { RequestTitleSection } from '@/components/request-flow/RequestTitleSection';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { MARKET } from '@/config';
import {
  useProject,
  useProjectActivity,
  useProjectAssignments,
  useProjectContributions,
} from '@/features/projects/project-api';
import { projectViewerMayViewAssignments } from '@/features/projects/project-assignments-visibility';
import {
  personProfileFromProjectDetail,
  projectCreatorProfileFields,
} from '@/features/projects/project-creator-profile';
import { projectViewerMayContribute } from '@/features/projects/project-contribute';
import { projectDetailBadge } from '@/features/projects/project-status';
import {
  formatCoarseLocationLabel,
  formatMoney,
  formatWhenHome,
} from '@/lib/format';
import { useRouteParam } from '@/lib/route-param';

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
  const [tab, setTab] = useState<ProjectDetailTab>('contributions');
  const [contributeOpen, setContributeOpen] = useState(false);
  const [creatorProfilePreview, setCreatorProfilePreview] = useState<PersonProfilePreview | null>(
    null,
  );

  const project = useProject(id);
  const mayViewAssignments = Boolean(
    project.data && projectViewerMayViewAssignments(project.data),
  );
  const assignments = useProjectAssignments(id, { enabled: mayViewAssignments });
  const contributions = useProjectContributions(id);
  const activity = useProjectActivity(id);

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

  const canContribute = Boolean(detail && projectViewerMayContribute(detail));

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

  const locationLabel = detail.location_label
    ? formatCoarseLocationLabel(detail.location_label)
    : 'Not set';

  const creatorProfile = projectCreatorProfileFields(detail);
  const showAssignmentsTab = projectViewerMayViewAssignments(detail);
  const showRespondFooter = !detail.viewer_is_creator;

  const scrollPaddingBottom = showRespondFooter ? 112 : 48;

  return (
    <Screen className="relative flex min-h-0 flex-1 flex-col">
      <RequestFlowHeader title={headerTitle} onBack={() => router.back()} />

      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto px-5" style={{ paddingBottom: scrollPaddingBottom }}>
          <div className="flex flex-col gap-5">
            <RequestMetaRow badgeLabel={badge.label} badgeTone={badge.tone} trailing={metaTime} />

            <RequestTitleSection title={detail.title} description={detail.description} />

            <RequestAttachmentSection attachmentPath={detail.attachment_path} />

            {progress ? (
              <ProjectFundingCard
                budgetLabel={formatMoney(koboToMajor(detail.budget_total_kobo), MARKET.currency)}
                contributedLabel={formatMoney(
                  koboToMajor(detail.contributed_total_kobo),
                  MARKET.currency,
                )}
                progressPct={progress.pctBudget}
                minTargetLabel={formatMoney(
                  koboToMajor(detail.min_funding_target_kobo),
                  MARKET.currency,
                )}
                minTargetMet={progress.metMin}
                whenLabel={
                  detail.funding_deadline_at
                    ? formatWhenHome(detail.funding_deadline_at)
                    : 'Not set'
                }
                locationLabel={locationLabel}
                fundingStatusLabel={detail.funding_status}
                onOpenContribute={canContribute ? () => setContributeOpen(true) : undefined}
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
                onPress={() => setCreatorProfilePreview(personProfileFromProjectDetail(detail))}
              />
            ) : null}

            <ProjectDetailTabs
              active={tab}
              onChange={setTab}
              showAssignments={showAssignmentsTab}
            />

            <div className="flex flex-col gap-3 pb-2">
              {tab === 'contributions' ? (
                <ProjectContributionsPanel contributions={contributions} />
              ) : null}
              {tab === 'assignments' ? (
                showAssignmentsTab ? (
                  <ProjectAssignmentsPanel assignments={assignments} />
                ) : (
                  <EmptyState
                    icon="briefcase-outline"
                    title="Respond to this project"
                    message="Assignment openings will appear here when you respond. Full assignment management is only visible to the creator and contributors."
                  />
                )
              ) : null}
              {tab === 'activity' ? <ProjectActivityPanel activity={activity} /> : null}
            </div>
          </div>
        </div>

        {showRespondFooter ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="pointer-events-auto w-full max-w-md">
              <Button
                label="Respond to project"
                variant="active"
                size="lg"
                corner="2xl"
                onClick={() => setTab('assignments')}
              />
            </div>
          </div>
        ) : null}
      </div>

      <PersonProfileSheet
        open={creatorProfilePreview !== null}
        profile={creatorProfilePreview}
        onClose={() => setCreatorProfilePreview(null)}
      />

      <ProjectContributeModal
        open={contributeOpen}
        projectId={id}
        projectTitle={detail.title}
        minContributionMajor={koboToMajor(detail.min_contribution_kobo)}
        onClose={() => setContributeOpen(false)}
      />
    </Screen>
  );
}