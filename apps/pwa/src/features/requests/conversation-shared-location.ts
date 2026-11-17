import type { Position } from '@/lib/geolocation';

export const SHARED_LOCATION_MESSAGE_LABEL = '📍 Shared location';

const MAPS_QUERY_REGEX = /query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;

export function sharedLocationMapsUrl(position: Position): string {
  return `https://www.google.com/maps/search/?api=1&query=${position.latitude},${position.longitude}`;
}

export function formatSharedLocationMessageBody(position: Position): string {
  return `${SHARED_LOCATION_MESSAGE_LABEL}\n${sharedLocationMapsUrl(position)}`;
}

export function parseSharedLocationMessageBody(body: string): Position | null {
  const match = body.match(MAPS_QUERY_REGEX);
  if (!match) return null;
  const latitude = Number.parseFloat(match[1]!);
  const longitude = Number.parseFloat(match[2]!);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function isSharedLocationMessageBody(body: string): boolean {
  return parseSharedLocationMessageBody(body) != null;
}