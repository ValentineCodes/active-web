import * as Location from 'expo-location';

/**
 * Location is never read at launch or during onboarding. These helpers are called when
 * the user submits a request, goes Active, or chooses to browse requests nearby.
 * Each is a moment they have just chosen, which is what makes the permission prompt
 * legible.
 */

export type Position = { latitude: number; longitude: number };

/**
 * A refused prompt is an ordinary outcome the screens render a state for, so it comes
 * back as a value rather than an exception.
 */
export type PositionResult =
  | { ok: true; position: Position }
  | { ok: false; reason: 'permission-denied' | 'services-disabled' | 'unavailable' };

export async function requestPosition(): Promise<PositionResult> {
  const { granted } = await Location.requestForegroundPermissionsAsync();

  if (!granted) {
    return { ok: false, reason: 'permission-denied' };
  }

  if (!(await Location.hasServicesEnabledAsync())) {
    return { ok: false, reason: 'services-disabled' };
  }

  try {
    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { ok: true, position: { latitude: coords.latitude, longitude: coords.longitude } };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * Reads the position only if permission was already granted, used to keep an Active
 * provider's matching position current. Never prompts.
 */
export type ForegroundPermission = 'granted' | 'denied' | 'undetermined';

export async function readForegroundPermission(): Promise<ForegroundPermission> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

export async function readPositionIfPermitted(): Promise<Position | null> {
  const { granted } = await Location.getForegroundPermissionsAsync();
  if (!granted) return null;

  try {
    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { latitude: coords.latitude, longitude: coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Suggests the coarse area label shown to providers before acceptance. The requester
 * confirms or edits it, so a wrong guess is harmless and nothing precise is derived
 * from it.
 */
export async function suggestAreaLabel(position: Position): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync(position);
    if (!place) return null;

    const parts = [place.district ?? place.subregion, place.city ?? place.region].filter(
      (part): part is string => Boolean(part),
    );

    return parts.length > 0 ? [...new Set(parts)].join(', ') : null;
  } catch {
    return null;
  }
}
