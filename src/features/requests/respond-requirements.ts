import { hasProfilePhotoReady } from '@/features/profile/api';
import { requestPosition, type Position, type PositionResult } from '@/lib/location';

export type RespondRequirementsProfile = {
  display_name: string | null;
  avatar_path: string | null;
  avatar_captured_in_app: boolean;
  phone: string | null;
};

export type RespondRequirementBlocker =
  | { kind: 'photo' }
  | { kind: 'location'; reason: Exclude<PositionResult, { ok: true }>['reason'] }
  | { kind: 'account'; message: string };

export function hasRespondProfilePhoto(
  profile:
    Pick<RespondRequirementsProfile, 'avatar_path' | 'avatar_captured_in_app'> | null | undefined,
): boolean {
  return hasProfilePhotoReady(profile);
}

/** Profile and verification checks that do not need device permission. */
export function respondRequirementBlocker(
  profile: RespondRequirementsProfile | null | undefined,
): RespondRequirementBlocker | null {
  if (!profile?.display_name) {
    return { kind: 'account', message: 'Finish setting up your profile first.' };
  }

  if (!profile.phone) {
    return { kind: 'account', message: 'Sign in with your phone number to respond to requests.' };
  }

  if (!hasRespondProfilePhoto(profile)) {
    return { kind: 'photo' };
  }

  return null;
}

export async function resolveRespondRequirements(
  profile: RespondRequirementsProfile | null | undefined,
): Promise<{ ok: true; position: Position } | { ok: false; blocker: RespondRequirementBlocker }> {
  const staticBlocker = respondRequirementBlocker(profile);
  if (staticBlocker) return { ok: false, blocker: staticBlocker };

  const positionResult = await requestPosition();
  if (!positionResult.ok) {
    return { ok: false, blocker: { kind: 'location', reason: positionResult.reason } };
  }

  return { ok: true, position: positionResult.position };
}

export function locationRequirementMessage(
  reason: Exclude<PositionResult, { ok: true }>['reason'],
): string {
  switch (reason) {
    case 'permission-denied':
      return 'We use your location once to check this request is near you. Your exact address is not shared when you respond.';
    case 'services-disabled':
      return 'Turn on location services on your device so we can confirm this request is near you.';
    default:
      return 'We could not read your location. Try again in a moment.';
  }
}
