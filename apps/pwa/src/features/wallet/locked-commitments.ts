'use client';

import { useMemo } from 'react';

import { summarizeRequestFunding } from '@/features/requests/funding';
import { useMyRequests } from '@/features/requests/requester-api';

const ACTIVE_REQUEST_STATUSES = new Set([
  'posted',
  'searching',
  'accepted',
  'in_progress',
  'completion_pending',
]);

export type WalletLockedCommitment = {
  requestId: string;
  title: string;
  amount: number;
  currency: string;
};

export function useWalletLockedCommitments() {
  const requests = useMyRequests();

  const commitments = useMemo((): WalletLockedCommitment[] => {
    if (!requests.data) return [];

    return requests.data
      .filter(
        (request) =>
          ACTIVE_REQUEST_STATUSES.has(request.status) &&
          (request.payment_status === 'locked' || request.payment_status === 'pending') &&
          request.offered_amount !== null &&
          request.offered_amount > 0,
      )
      .map((request) => {
        const funding = summarizeRequestFunding(request.offered_amount!);
        return {
          requestId: request.request_id,
          title: request.title,
          amount: funding.total,
          currency: request.currency ?? funding.currency,
        };
      });
  }, [requests.data]);

  return { commitments, isPending: requests.isPending };
}
