'use client';

import { MilestonePlanCard } from '@/components/request-flow/MilestonePlanCard';
import {
  milestoneProposalItems,
  type MilestoneProposalRow,
} from '@/features/requests/milestone-api';

export function ResponseMilestoneSection({
  responseId,
  proposals,
  offeredAmount,
  quotedAmount,
  currency,
}: {
  requestId: string;
  responseId: string;
  proposals: MilestoneProposalRow[];
  offeredAmount: number;
  quotedAmount: number | null;
  currency: string;
}) {
  const responseProposal =
    proposals.find((row) => row.response_id === responseId && row.status !== 'superseded') ?? null;

  const totalMajor = quotedAmount !== null && quotedAmount > 0 ? quotedAmount : offeredAmount;

  if (!responseProposal || responseProposal.status !== 'proposed') {
    return null;
  }

  const items = milestoneProposalItems(responseProposal);

  return (
    <MilestonePlanCard
      paymentStructure="milestone"
      totalMajor={totalMajor}
      milestones={items}
      currency={currency}
      heading="Their proposed plan"
      variant="proposed"
    />
  );
}