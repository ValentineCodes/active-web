import { describe, expect, it } from 'vitest';

import {
  responderDisplayedMilestones,
  type MilestoneProposalRow,
} from '@/features/requests/milestone-api';
import { resolveAcceptMilestonePlan } from '@/features/requests/milestone-negotiation';

describe('milestone negotiation', () => {
  it('accept plan uses helper proposal when present', () => {
    const proposals = [
      {
        proposal_id: 'p1',
        response_id: 'r1',
        status: 'proposed',
        items: [
          { position: 1, title: 'A', description: '', amount: 5000 },
          { position: 2, title: 'B', description: '', amount: 5000 },
        ],
      },
    ] as unknown as MilestoneProposalRow[];

    const { items, totalMajor } = resolveAcceptMilestonePlan(proposals, 'r1', 10_000, 10_000);
    expect(items).toHaveLength(2);
    expect(totalMajor).toBe(10_000);
  });

  it('shows responder counterproposal on help summary when proposed', () => {
    const requester = [
      { position: 1, title: 'Original A', description: '', amount: 5000 },
      { position: 2, title: 'Original B', description: '', amount: 5000 },
    ];
    const proposals = [
      {
        proposal_id: 'p1',
        response_id: 'r1',
        status: 'proposed',
        items: [
          { position: 1, title: 'New A', description: '', amount: 6000 },
          { position: 2, title: 'New B', description: '', amount: 4000 },
        ],
      },
    ] as unknown as MilestoneProposalRow[];

    const display = responderDisplayedMilestones(proposals, 'r1', requester);
    expect(display.variant).toBe('proposed');
    expect(display.items[0]?.title).toBe('New A');
  });

  it('keeps requester plan when helper did not propose changes', () => {
    const requester = [
      { position: 1, title: 'Original A', description: '', amount: 5000 },
      { position: 2, title: 'Original B', description: '', amount: 5000 },
    ];

    const display = responderDisplayedMilestones([], 'r1', requester);
    expect(display.variant).toBe('default');
    expect(display.items).toEqual(requester);
  });
});