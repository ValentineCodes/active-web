import type { RespondableRequest } from '@/features/requests/responses-api';

/** Guests may read marketplace listings but not act on them until signed in (Phase 5 gate). */
export function guestMaySubmitRequestResponse(hasSession: boolean, request: RespondableRequest | null) {
  return hasSession && Boolean(request?.respond_allowed);
}

export function guestMayInteractWithProject(hasSession: boolean, viewerIsCreator: boolean) {
  return hasSession && !viewerIsCreator;
}

export function guestShowsRequestParticipation(hasSession: boolean) {
  return hasSession;
}

export function publicProfileShowsCrown(crownPublic: boolean, crownTier: string) {
  return crownPublic && crownTier !== 'hidden';
}