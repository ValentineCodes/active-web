import {
  milestoneProposalItems,
  pickMilestonePlanForResponse,
  type MilestoneProposalRow,
} from '@/features/requests/milestone-api';
import type { MilestoneProposalItem } from '@/features/requests/milestones';

export function resolveAcceptMilestonePlan(
  proposals: MilestoneProposalRow[],
  responseId: string,
  offeredAmount: number,
  quotedAmount: number | null,
): {
  items: MilestoneProposalItem[];
  totalMajor: number;
} {
  const row = pickMilestonePlanForResponse(proposals, responseId);
  const totalMajor = quotedAmount !== null && quotedAmount > 0 ? quotedAmount : offeredAmount;
  return {
    items: milestoneProposalItems(row),
    totalMajor,
  };
}