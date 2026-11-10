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

export async function requestPosition(options?: { fresh?: boolean }): Promise<PositionResult> {
  if (!navigator.geolocation) {
    return { ok: false, reason: 'unavailable' };
  }

  const before = await readForegroundPermission();
  if (before === 'denied') return { ok: false, reason: 'permission-denied' };

  const position = await new Promise<Position | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (fix) => resolve(positionFromFix(fix.coords)),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) resolve(null);
        else resolve(null);
      },
      {
        enableHighAccuracy: Boolean(options?.fresh),
        timeout: POSITION_READ_TIMEOUT_MS,
        maximumAge: options?.fresh ? 0 : 60_000,
      },
    );
  });

  if (!position) {
    const after = await readForegroundPermission();
    if (after === 'denied') return { ok: false, reason: 'permission-denied' };
    return { ok: false, reason: 'unavailable' };
  }
  return { ok: true, position };
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

export async function suggestAreaLabel(): Promise<string | null> {
  return null;
}

export function parsePositionParam(lat?: string, lng?: string): Position | null {
  if (!lat || !lng) return null;
  const latitude = Number.parseFloat(lat);
  const longitude = Number.parseFloat(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}
