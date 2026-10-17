import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

/**
 * Local Supabase is on the dev machine. iOS simulators can use the LAN address from
 * `.env`, but Android emulators must use `10.0.2.2`, and physical Android devices
 * should use the same host Metro is already reaching (from `hostUri`).
 */
export function resolveSupabaseUrl(configured: string): string {
  if (!__DEV__) return configured;

  const url = new URL(configured);

  if (Platform.OS === 'android' && !Device.isDevice) {
    url.hostname = '10.0.2.2';
    return url.toString().replace(/\/$/, '');
  }

  const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (Platform.OS === 'android' && metroHost) {
    url.hostname = metroHost;
    return url.toString().replace(/\/$/, '');
  }

  return configured;
}
