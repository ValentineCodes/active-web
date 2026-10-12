import * as Location from 'expo-location';

/**
 * Location is never read at launch or during onboarding. These helpers are called when
 * the user posts a request, responds to one, or opens Home to browse nearby.
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

async function ensureForegroundPositionAccess(): Promise<
  Extract<PositionResult, { ok: false }> | null
> {
  const permissionBefore = await readForegroundPermission();
  if (permissionBefore === 'denied') {
    return { ok: false, reason: 'permission-denied' };
  }

  const { granted } = await Location.requestForegroundPermissionsAsync();

  if (!granted) {
    return { ok: false, reason: 'permission-denied' };
  }

  if (!(await Location.hasServicesEnabledAsync())) {
    return { ok: false, reason: 'services-disabled' };
  }

  return null;
}

type RequestPositionOptions = {
  /** Skip the last-known fix and wait for a live GPS read (e.g. saving a place). */
  fresh?: boolean;
};

export async function requestPosition(options?: RequestPositionOptions): Promise<PositionResult> {
  const blocked = await ensureForegroundPositionAccess();
  if (blocked) return blocked;

  if (!options?.fresh) {
    try {
      const last = await Location.getLastKnownPositionAsync();
      const cached = positionFromLocationObject(last);
      if (cached) {
        return { ok: true, position: cached };
      }
    } catch {
      // Fall through to a live read.
    }
  }

  const position = await readCurrentPosition();
  if (!position) {
    return { ok: false, reason: 'unavailable' };
  }
  return { ok: true, position };
}

/**
 * Reads the position only if permission was already granted. Never prompts.
 */
export type ForegroundPermission = 'granted' | 'denied' | 'undetermined';

export async function readForegroundPermission(): Promise<ForegroundPermission> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

const POSITION_READ_TIMEOUT_MS = 12_000;

let positionReadInFlight: Promise<Position | null> | null = null;

function positionFromLocationObject(
  fix: Location.LocationObject | null | undefined,
): Position | null {
  if (!fix) return null;

  const { latitude, longitude } = fix.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  // Some devices report (0, 0) before a real fix.
  if (latitude === 0 && longitude === 0) return null;

  return { latitude, longitude };
}

async function readCurrentPositionOnce(accuracy: Location.Accuracy): Promise<Position | null> {
  try {
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('location-timeout')), POSITION_READ_TIMEOUT_MS);
      }),
    ]);
    return positionFromLocationObject(fix);
  } catch {
    return null;
  }
}

async function readCurrentPosition(): Promise<Position | null> {
  if (positionReadInFlight) {
    return positionReadInFlight;
  }

  positionReadInFlight = (async () => {
    const balanced = await readCurrentPositionOnce(Location.Accuracy.Balanced);
    if (balanced) return balanced;
    return readCurrentPositionOnce(Location.Accuracy.Low);
  })();

  try {
    return await positionReadInFlight;
  } finally {
    positionReadInFlight = null;
  }
}

/**
 * Silent position read for screens that already have permission. Uses the last known
 * fix first so navigation stays instant; only waits on GPS when nothing is cached.
 */
export async function readPositionIfPermitted(): Promise<Position | null> {
  const { granted } = await Location.getForegroundPermissionsAsync();
  if (!granted) return null;

  try {
    const last = await Location.getLastKnownPositionAsync();
    const cached = positionFromLocationObject(last);
    if (cached) return cached;
  } catch {
    // Fall through to a live read.
  }

  return readCurrentPosition();
}

export function positionErrorMessage(
  result: Extract<PositionResult, { ok: false }>,
  settingsHint: string,
): string {
  if (result.reason === 'permission-denied') {
    return `Location access is off. ${settingsHint}`;
  }
  if (result.reason === 'services-disabled') {
    return 'Location services are switched off on this device.';
  }
  return 'We could not get your location. Try again in a moment.';
}

export function parsePositionParam(
  latitude: string | string[] | undefined,
  longitude: string | string[] | undefined,
): Position | null {
  const latRaw = Array.isArray(latitude) ? latitude[0] : latitude;
  const lngRaw = Array.isArray(longitude) ? longitude[0] : longitude;
  if (!latRaw || !lngRaw) return null;

  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { latitude: lat, longitude: lng };
}

/** Resolve a place name to coordinates for posting a request away from the user's GPS fix. */
export async function geocodePlaceQuery(query: string): Promise<Position | null> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return null;

  try {
    const results = await Location.geocodeAsync(trimmed);
    const first = results[0];
    if (!first) return null;
    return { latitude: first.latitude, longitude: first.longitude };
  } catch {
    return null;
  }
}

/**
 * Suggests the coarse area label shown to others before selection. The requester
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
