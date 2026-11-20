import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

import { env } from '@/lib/env';

function isLoopbackHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

/**
 * Local Supabase runs on the dev machine. iOS simulators can use loopback from `.env`;
 * Android emulators use `10.0.2.2`; physical devices should reach the same host as Metro
 * (from `hostUri`) so signed storage URLs and API calls load on a real phone.
 */
export function resolveSupabaseUrl(configured: string): string {
  if (!__DEV__) return configured;

  const url = new URL(configured);
  const loopback = isLoopbackHostname(url.hostname);

  if (Platform.OS === 'android' && !Device.isDevice) {
    url.hostname = '10.0.2.2';
    return url.toString().replace(/\/$/, '');
  }

  const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (metroHost && loopback && Device.isDevice) {
    url.hostname = metroHost;
    return url.toString().replace(/\/$/, '');
  }

  if (Platform.OS === 'android' && metroHost) {
    url.hostname = metroHost;
    return url.toString().replace(/\/$/, '');
  }

  return configured;
}

/**
 * Storage signed URLs are built from the configured API origin. On a physical device
 * that origin may still be loopback even when the Supabase client was pointed at LAN.
 */
export function resolveDevStorageSignedUrl(signedUrl: string, configuredSupabaseUrl: string): string {
  if (!__DEV__) return signedUrl;

  const resolvedBase = resolveSupabaseUrl(configuredSupabaseUrl);
  if (resolvedBase === configuredSupabaseUrl) return signedUrl;

  try {
    const signed = new URL(signedUrl);
    const configured = new URL(configuredSupabaseUrl);
    const resolved = new URL(resolvedBase);
    if (isLoopbackHostname(signed.hostname) && isLoopbackHostname(configured.hostname)) {
      signed.hostname = resolved.hostname;
      signed.port = resolved.port;
      return signed.toString();
    }
  } catch {
    // Relative or malformed URL — return as-is.
  }

  return signedUrl;
}

/** Apply dev LAN / emulator host fixes to a storage signed URL before passing it to Image. */
export function finalizeDevSignedUrl(signedUrl: string): string {
  return resolveDevStorageSignedUrl(signedUrl, env.supabaseUrl);
}