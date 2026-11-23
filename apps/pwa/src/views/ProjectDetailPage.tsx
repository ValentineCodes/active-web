'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/lib/navigation';

import {
  PersonProfileSheet,
  type PersonProfilePreview,
} from '@/components/profile/PersonProfileSheet';
import { ProjectContributeModal } from '@/components/project-flow/ProjectContributeModal';
import { ProjectGroupChatFab } from '@/components/project-flow/ProjectGroupChatFab';
import { ProjectActivityPanel } from '@/components/project-flow/ProjectDetailTabPanels';
import { ProjectResponsesPanel } from '@/components/project-flow/ProjectResponsesPanel';
import { ProjectDetailTabs, type ProjectDetailTab } from '@/components/project-flow/ProjectDetailTabs';
import { ProjectFundingCard } from '@/components/project-flow/ProjectFundingCard';
import { ProjectResponseTabPanel } from '@/components/project-flow/ProjectResponseTabPanel';
import { ProjectWorkerWorkPanel } from '@/components/project-flow/ProjectWorkerWorkPanel';
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
  useMyProjectAssignments,
  useProject,
  useProjectActivity,
  useProjectResponses,
} from '@/features/projects/project-api';
import { filterWorkerAssignmentsForProject } from '@/features/projects/project-worker-work';
import { useMyProjectResponse } from '@/features/projects/project-responses-api';
import { projectViewerMayViewAssignments } from '@/features/projects/project-assignments-visibility';
import {
  personProfileFromProjectDetail,
  projectCreatorProfileFields,
} from '@/features/projects/project-creator-profile';
import {
  projectContributionRemainingMajor,
  projectViewerMayContribute,
} from '@/features/projects/project-contribute';
import { useWorkerProjectPreHandshakeConversation } from '@/features/projects/project-conversation-api';
import {
  projectResponseWizardInitialOffer,
  useProjectForRespond,
  useRespondToProject,
  useWithdrawProjectResponse,
} from '@/features/projects/project-responses-api';
import { conversationHref } from '@/lib/conversation-navigation';
import { projectDetailBadge, projectShowsFundingRaised } from '@/features/projects/project-status';
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

  const detail = project.data;

  const mayViewAssignments = Boolean(
    detail && projectViewerMayViewAssignments(detail),
  );
  const projectResponses = useProjectResponses(id, { enabled: mayViewAssignments });
  const myProjectResponse = useMyProjectResponse(id);
  const myProjectAssignments = useMyProjectAssignments({
    enabled: Boolean(detail && !detail.viewer_is_creator),
  });
  const activity = useProjectActivity(id);
  const workerActiveAssignments = useMemo(
    () => filterWorkerAssignmentsForProject(myProjectAssignments.data ?? [], id),
    [id, myProjectAssignments.data],
  );
  const workerHasActiveWork = workerActiveAssignments.length > 0;

  const workerPreHandshakeChat = useWorkerProjectPreHandshakeConversation(
    id,
    Boolean(
      detail &&
        !detail.viewer_is_creator &&
        existingResponse &&
        !workerHasActiveWork,
    ),
  );
  const headerTitle = detail?.viewer_is_creator ? 'Your project' : 'Project';
  const showAssignmentsTabFromData = Boolean(
    detail && projectViewerMayViewAssignments(detail),
  );
  const showWorkerWorkTab = Boolean(detail && !detail.viewer_is_creator && workerHasActiveWork);
  const showResponseTab = Boolean(detail && !detail.viewer_is_creator && !workerHasActiveWork);

  useEffect(() => {
    if (!detail || defaultTabSet.current) return;
    defaultTabSet.current = true;
    if (!detail.viewer_is_creator) {
      setTab(workerHasActiveWork ? 'work' : 'response');
    } else if (showAssignmentsTabFromData) {
      setTab('responses');
    }
  }, [detail, showAssignmentsTabFromData, workerHasActiveWork]);

  useEffect(() => {
    if (!showAssignmentsTabFromData && tab === 'responses') {
      setTab(showWorkerWorkTab ? 'work' : showResponseTab ? 'response' : 'activity');
    }
    if (!showResponseTab && tab === 'response') {
      setTab(showWorkerWorkTab ? 'work' : 'activity');
    }
    if (!showWorkerWorkTab && tab === 'work') {
      setTab(showResponseTab ? 'response' : 'activity');
    }
  }, [showAssignmentsTabFromData, showResponseTab, showWorkerWorkTab, tab]);

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
    if (!respondable || workerHasActiveWork) return;
    respond.reset();
    setNeedsPhotoStep(!hasProfilePhotoReady(profile.data));
    setFlowStep(0);
    setFlowKey((k) => k + 1);
    setInFlow(true);
  }, [profile.data, respond, respondable, workerHasActiveWork]);

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

  const workerAssignmentsLoading =
    Boolean(detail && !detail.viewer_is_creator) && myProjectAssignments.isPending;

  if (
    project.isPending ||
    workerAssignmentsLoading ||
    (showResponseTab && respondMetaPending)
  ) {
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
  const groupChatConversationId = detail.group_chat_conversation_id ?? null;
  const groupChatUnread = detail.group_chat_unread_count ?? 0;

  return (
    <Screen className="relative flex min-h-0 flex-1 flex-col">
      <RequestFlowHeader title={headerTitle} onBack={() => router.back()} />

      <div className="relative min-h-0 flex-1">
        <div
          className={`h-full overflow-y-auto px-5 ${groupChatConversationId ? 'pb-28' : 'pb-12'}`}
        >
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
                showContributedProgress={projectShowsFundingRaised(detail.funding_status)}
                onOpenContribute={canContribute ? () => setContributeOpen(true) : undefined}
                currency={MARKET.currency}
                budgetBreakdown={
                  detail.viewer_may_view_budget_breakdown &&
                  detail.paid_out_total_kobo != null &&
                  detail.reserved_total_kobo != null &&
                  detail.available_total_kobo != null
                    ? {
                        paidOutKobo: detail.paid_out_total_kobo,
                        reservedKobo: detail.reserved_total_kobo,
                        availableKobo: detail.available_total_kobo,
                      }
                    : null
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
              showWorkerWork={showWorkerWorkTab}
            />

            <div className="flex flex-col gap-3 pb-2">
              {tab === 'work' && showWorkerWorkTab ? (
                <ProjectWorkerWorkPanel
                  projectId={id}
                  assignments={workerActiveAssignments}
                  assignmentsLoading={myProjectAssignments.isPending}
                  assignmentsError={
                    myProjectAssignments.error instanceof Error
                      ? myProjectAssignments.error
                      : null
                  }
                  onRetry={() => void myProjectAssignments.refetch()}
                />
              ) : null}
              {tab === 'response' && showResponseTab ? (
                <ProjectResponseTabPanel
                  budgetMajor={budgetMajor}
                  existingResponse={existingResponse}
                  respondAllowed={respondAllowed && !workerHasActiveWork}
                  respondError={respond.error instanceof Error ? respond.error : null}
                  withdrawError={withdraw.error instanceof Error ? withdraw.error : null}
                  withdrawLoading={withdraw.isPending}
                  onBeginRespond={beginFlow}
                  onEditResponse={beginFlow}
                  onCancelResponse={confirmWithdraw}
                />
              ) : null}
              {tab === 'responses' && showAssignmentsTab ? (
                <ProjectResponsesPanel
                  responses={projectResponses}
                  allowDiscuss={Boolean(detail.viewer_is_creator)}
                  allowReview={Boolean(detail.viewer_is_creator)}
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
        maxContributionMajor={projectContributionRemainingMajor(
          detail.budget_total_kobo,
          detail.contributed_total_kobo,
        )}
        onClose={() => setContributeOpen(false)}
      />

      {groupChatConversationId ? (
        <ProjectGroupChatFab
          unreadCount={groupChatUnread}
          onPress={() =>
            router.push(conversationHref(groupChatConversationId, `/project/${id}`))
          }
        />
      ) : null}
    </Screen>
  );
}