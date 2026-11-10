export type Position = { latitude: number; longitude: number };

export type PositionResult =
  | { ok: true; position: Position }
  | { ok: false; reason: 'permission-denied' | 'services-disabled' | 'unavailable' };

export type ForegroundPermission = 'granted' | 'denied' | 'undetermined';

const POSITION_READ_TIMEOUT_MS = 12_000;

let positionReadInFlight: Promise<Position | null> | null = null;

function positionFromFix(coords: GeolocationCoordinates | null | undefined): Position | null {
  if (!coords) return null;
  const { latitude, longitude } = coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

export async function readForegroundPermission(): Promise<ForegroundPermission> {
  if (!navigator.permissions?.query) return 'undetermined';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    if (status.state === 'granted') return 'granted';
    if (status.state === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

function readCurrentPositionOnce(highAccuracy: boolean): Promise<Position | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (fix) => resolve(positionFromFix(fix.coords)),
      () => resolve(null),
      { enableHighAccuracy: highAccuracy, timeout: POSITION_READ_TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
}

async function readCurrentPosition(): Promise<Position | null> {
  if (positionReadInFlight) return positionReadInFlight;
  positionReadInFlight = (async () => {
    const balanced = await readCurrentPositionOnce(false);
    if (balanced) return balanced;
    return readCurrentPositionOnce(true);
  })();
  try {
    return await positionReadInFlight;
  } finally {
    positionReadInFlight = null;
  }
}

/**
 * Requests a GPS fix. Calls `getCurrentPosition` immediately so the browser permission
 * prompt stays tied to the user tap (no `await` before the geolocation call).
 */
export function requestPosition(options?: { fresh?: boolean }): Promise<PositionResult> {
  if (!navigator.geolocation) {
    return Promise.resolve({ ok: false, reason: 'unavailable' });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (fix) => {
        const position = positionFromFix(fix.coords);
        if (!position) {
          resolve({ ok: false, reason: 'unavailable' });
          return;
        }
        resolve({ ok: true, position });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ ok: false, reason: 'permission-denied' });
          return;
        }
        if (error.code === error.POSITION_UNAVAILABLE) {
          resolve({ ok: false, reason: 'services-disabled' });
          return;
        }
        resolve({ ok: false, reason: 'unavailable' });
      },
      {
        enableHighAccuracy: Boolean(options?.fresh),
        timeout: POSITION_READ_TIMEOUT_MS,
        maximumAge: options?.fresh ? 0 : 60_000,
      },
    );
  });
}

export async function readPositionIfPermitted(): Promise<Position | null> {
  const permission = await readForegroundPermission();
  if (permission !== 'granted') return null;
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
    return 'Location services appear to be off on this device.';
  }
  return 'We could not get your location. Try again in a moment.';
}

/**
 * Coarse area label from coordinates (shown before a helper is selected).
 * Mirrors native `expo-location` reverse geocode shape.
 */
export async function suggestAreaLabel(position: Position): Promise<string | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(position.latitude));
    url.searchParams.set('lon', String(position.longitude));
    url.searchParams.set('format', 'json');
    url.searchParams.set('zoom', '14');

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        'User-Agent': 'ActivePWA/1.0',
      },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { address?: Record<string, string | undefined> };
    const address = data.address;
    if (!address) return null;

    const locality =
      address.city ??
      address.town ??
      address.village ??
      address.municipality ??
      address.county ??
      address.state;
    const district =
      address.suburb ?? address.neighbourhood ?? address.city_district ?? address.district ?? address.subregion;

    const parts = [district, locality].filter((part): part is string => Boolean(part?.trim()));
    if (parts.length === 0) return null;

    return [...new Set(parts.map((part) => part.trim()))].join(', ');
  } catch {
    return null;
  }
}

export function parsePositionParam(lat?: string, lng?: string): Position | null {
  if (!lat || !lng) return null;
  const latitude = Number.parseFloat(lat);
  const longitude = Number.parseFloat(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}
