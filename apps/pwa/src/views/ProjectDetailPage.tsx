'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/lib/navigation';

import {
  PersonProfileSheet,
  type PersonProfilePreview,
} from '@/components/profile/PersonProfileSheet';
import { ProjectContributeModal } from '@/components/project-flow/ProjectContributeModal';
import { ProjectActivityPanel } from '@/components/project-flow/ProjectDetailTabPanels';
import { ProjectResponsesPanel } from '@/components/project-flow/ProjectResponsesPanel';
import { ProjectDetailTabs, type ProjectDetailTab } from '@/components/project-flow/ProjectDetailTabs';
import { ProjectFundingCard } from '@/components/project-flow/ProjectFundingCard';
import { ProjectResponseTabPanel } from '@/components/project-flow/ProjectResponseTabPanel';
import { RequestAttachmentSection } from '@/components/request-flow/RequestAttachmentSection';
import { ResponseCreationFlow } from '@/components/request-flow/ResponseCreationFlow';
import { RequestFlowHeader } from '@/components/request-flow/RequestFlowHeader';
import { RequestMetaRow } from '@/components/request-flow/RequestMetaRow';
import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { RequestTagsLine } from '@/components/request-flow/RequestTagsLine';
import { RequestTitleSection } from '@/components/request-flow/RequestTitleSection';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { MARKET } from '@/config';
import { hasProfilePhotoReady, useMyProfile } from '@/features/profile/api';
import {
  useProject,
  useProjectActivity,
  useProjectResponses,
} from '@/features/projects/project-api';
import { projectViewerMayViewAssignments } from '@/features/projects/project-assignments-visibility';
import {
  personProfileFromProjectDetail,
  projectCreatorProfileFields,
} from '@/features/projects/project-creator-profile';
import { projectViewerMayContribute } from '@/features/projects/project-contribute';
import { useWorkerProjectPreHandshakeConversation } from '@/features/projects/project-conversation-api';
import {
  projectResponseWizardInitialOffer,
  useProjectForRespond,
  useRespondToProject,
  useWithdrawProjectResponse,
} from '@/features/projects/project-responses-api';
import { conversationHref } from '@/lib/conversation-navigation';
import { projectDetailBadge } from '@/features/projects/project-status';
import {
  formatCoarseLocationLabel,
  formatMoney,
  formatWhenHome,
} from '@/lib/format';
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
  const [tab, setTab] = useState<ProjectDetailTab>('activity');
  const [contributeOpen, setContributeOpen] = useState(false);
  const [creatorProfilePreview, setCreatorProfilePreview] = useState<PersonProfilePreview | null>(
    null,
  );
  const defaultTabSet = useRef(false);

  const profile = useMyProfile();
  const project = useProject(id);
  const {
    request: respondable,
    existingResponse,
    respondAllowed,
    isPending: respondMetaPending,
  } = useProjectForRespond(id);
  const respond = useRespondToProject();
  const withdraw = useWithdrawProjectResponse();

  const [inFlow, setInFlow] = useState(false);
  const [flowStep, setFlowStep] = useState(0);
  const [flowKey, setFlowKey] = useState(0);
  const [needsPhotoStep, setNeedsPhotoStep] = useState(false);

  const mayViewAssignments = Boolean(
    project.data && projectViewerMayViewAssignments(project.data),
  );
  const projectResponses = useProjectResponses(id, { enabled: mayViewAssignments });
  const activity = useProjectActivity(id);

  const detail = project.data;
  const workerPreHandshakeChat = useWorkerProjectPreHandshakeConversation(
    id,
    Boolean(detail && !detail.viewer_is_creator && existingResponse),
  );
  const headerTitle = detail?.viewer_is_creator ? 'Your project' : 'Project';
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

  const progress = useMemo(() => {
    if (!detail) return null;
    return fundingProgress(
      detail.contributed_total_kobo,
      detail.budget_total_kobo,
      detail.min_funding_target_kobo,
    );
  }, [detail]);

  const canContribute = Boolean(detail && projectViewerMayContribute(detail));
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
        projectId: id,
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
    if (
      !window.confirm(
        'Cancel response?\n\nYou can respond again later if the project is still open.',
      )
    ) {
      return;
    }
    withdraw.mutate(id, {
      onSuccess: () => showAppToast('Response cancelled'),
    });
  };

  if (project.isPending || (showResponseTab && respondMetaPending)) {
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

  if (inFlow && respondable) {
    return (
      <Screen className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col bg-canvas">
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
            submitError={respond.error instanceof Error ? respond.error : null}
            onSubmit={submitResponse}
          />
        </div>
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
  const showAssignmentsTab = showAssignmentsTabFromData;

  return (
    <Screen className="relative flex min-h-0 flex-1 flex-col">
      <RequestFlowHeader title={headerTitle} onBack={() => router.back()} />

      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto px-5 pb-12">
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
                onDiscussPress={
                  existingResponse && workerPreHandshakeChat.data
                    ? () =>
                        router.push(
                          conversationHref(workerPreHandshakeChat.data!, `/project/${id}`),
                        )
                    : undefined
                }
                discussLoading={workerPreHandshakeChat.isPending}
              />
            ) : null}

            <ProjectDetailTabs
              active={tab}
              onChange={setTab}
              showAssignments={showAssignmentsTab}
              showResponse={showResponseTab}
            />

            <div className="flex flex-col gap-3 pb-2">
              {tab === 'response' && showResponseTab ? (
                <ProjectResponseTabPanel
                  budgetMajor={budgetMajor}
                  existingResponse={existingResponse}
                  respondAllowed={respondAllowed}
                  respondError={respond.error instanceof Error ? respond.error : null}
                  withdrawError={withdraw.error instanceof Error ? withdraw.error : null}
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
                  projectId={id}
                />
              ) : null}
              {tab === 'activity' ? <ProjectActivityPanel activity={activity} /> : null}
            </div>
          </div>
        </div>
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