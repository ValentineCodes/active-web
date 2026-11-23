import { describe, expect, it } from 'vitest';

import {
  guestMayInteractWithProject,
  guestMaySubmitRequestResponse,
  guestShowsRequestParticipation,
  publicProfileShowsCrown,
} from '@/features/marketplace/guest-view';
import type { RespondableRequest } from '@/features/requests/responses-api';

const baseRequest: RespondableRequest = {
  request_id: 'r1',
  title: 'Help',
  description: 'Desc',
  scheduled_for: null,
  offered_amount: 1000,
  currency: 'NGN',
  location_label: 'Lagos',
  distance_m: 100,
  requester_id: 'u1',
  requester_display_name: 'Ada',
  requester_avatar_path: null,
  requester_bio: null,
  requester_rating_average: 5,
  requester_rating_count: 1,
  requester_completion_percent: 90,
  requester_identity_verified: true,
  attachment_path: null,
  tag_slugs: [],
  posted_at: new Date().toISOString(),
  respond_allowed: true,
};

describe('guest marketplace viewing', () => {
  it('allows guests to read requests but not respond', () => {
    expect(guestMaySubmitRequestResponse(false, baseRequest)).toBe(false);
    expect(guestMaySubmitRequestResponse(true, { ...baseRequest, respond_allowed: false })).toBe(
      false,
    );
    expect(guestMaySubmitRequestResponse(true, baseRequest)).toBe(true);
  });

  it('hides request participation UI for guests', () => {
    expect(guestShowsRequestParticipation(false)).toBe(false);
    expect(guestShowsRequestParticipation(true)).toBe(true);
  });

  it('blocks guest project worker and response interactions', () => {
    expect(guestMayInteractWithProject(false, false)).toBe(false);
    expect(guestMayInteractWithProject(true, false)).toBe(true);
    expect(guestMayInteractWithProject(false, true)).toBe(false);
  });

  it('respects crown_public on public profiles', () => {
    expect(publicProfileShowsCrown(false, 'gold')).toBe(false);
    expect(publicProfileShowsCrown(true, 'hidden')).toBe(false);
    expect(publicProfileShowsCrown(true, 'silver')).toBe(true);
  });
});