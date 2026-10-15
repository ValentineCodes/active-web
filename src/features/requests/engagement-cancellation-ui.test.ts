import {
  canShowEngagementCancelAction,
  engagementCancellationPollIntervalMs,
  isEngagementCancellationEligibleStatus,
  isEngagementCancellationPending,
} from './engagement-cancellation-ui.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  isEngagementCancellationEligibleStatus('accepted') &&
    isEngagementCancellationEligibleStatus('in_progress') &&
    !isEngagementCancellationEligibleStatus('completion_pending'),
  'eligible statuses',
);

assert(
  isEngagementCancellationPending('pending') && !isEngagementCancellationPending('declined'),
  'pending detection',
);

assert(
  canShowEngagementCancelAction({
    requestStatus: 'accepted',
    viewerIsRequester: true,
    pendingCancellation: false,
  }) &&
    !canShowEngagementCancelAction({
      requestStatus: 'accepted',
      viewerIsRequester: true,
      pendingCancellation: true,
    }) &&
    !canShowEngagementCancelAction({
      requestStatus: 'completion_pending',
      viewerIsRequester: false,
      pendingCancellation: false,
    }),
  'cancel action visibility',
);

const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 60 * 1000).toISOString();

assert(
  engagementCancellationPollIntervalMs(future, 'pending') === 60_000 &&
    engagementCancellationPollIntervalMs(past, 'pending') === 5_000 &&
    engagementCancellationPollIntervalMs(future, 'declined') === false,
  'poll intervals',
);

console.log('engagement-cancellation-ui.test.ts: ok');
