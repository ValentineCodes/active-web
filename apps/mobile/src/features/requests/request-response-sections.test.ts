import assert from 'node:assert/strict';
import test from 'node:test';

import {
  partitionRequestResponsesForRequester,
  requesterCanAcceptResponses,
} from './request-response-sections.ts';

const response = (
  id: string,
  status: 'pending' | 'accepted' | 'withdrawn' | 'declined',
) =>
  ({
    response_id: id,
    responder_id: id,
    display_name: 'Helper',
    avatar_path: null,
    bio: null,
    rating_average: 5,
    rating_count: 1,
    jobs_completed: 1,
    completion_percent: 100,
    phone_verified: true,
    identity_verified: true,
    message: 'Hi',
    quoted_amount: 10,
    distance_m: 100,
    status,
    created_at: new Date().toISOString(),
    expires_at: null,
    responder_available: true,
  }) as const;

test('requester can accept while posted or awaiting review', () => {
  assert.equal(
    requesterCanAcceptResponses('posted', { isAwaitingReview: false, isExpiredRequest: false }),
    true,
  );
  assert.equal(
    requesterCanAcceptResponses('awaiting_review', {
      isAwaitingReview: true,
      isExpiredRequest: false,
    }),
    true,
  );
  assert.equal(
    requesterCanAcceptResponses('accepted', { isAwaitingReview: false, isExpiredRequest: false }),
    false,
  );
});

test('partition hides accept actions during active engagement', () => {
  const rows = [response('a', 'accepted'), response('b', 'pending'), response('c', 'withdrawn')];
  const parts = partitionRequestResponsesForRequester(rows, 'accepted', {
    isAwaitingReview: false,
    isExpiredRequest: false,
  });

  assert.equal(parts.accepted?.response_id, 'a');
  assert.equal(parts.referencePending.length, 1);
  assert.equal(parts.selectablePending.length, 0);
  assert.equal(parts.canAccept, false);
});

test('partition restores selectable pending after reopen', () => {
  const rows = [response('b', 'pending')];
  const parts = partitionRequestResponsesForRequester(rows, 'posted', {
    isAwaitingReview: false,
    isExpiredRequest: false,
  });

  assert.equal(parts.selectablePending.length, 1);
  assert.equal(parts.canAccept, true);
});
