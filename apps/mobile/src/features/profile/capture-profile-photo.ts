import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase/client';

import { AVATAR_BUCKET, readUriBytes, uploadPrivateObject } from './storage';

export type ProfilePhotoCaptureOutcome =
  | { kind: 'saved' }
  | { kind: 'cancelled' }
  | { kind: 'permission_denied'; canAskAgain: boolean };

export type ProfilePhotoPickOutcome =
  | { kind: 'picked'; uri: string; bytes: Uint8Array }
  | { kind: 'cancelled' }
  | { kind: 'permission_denied'; canAskAgain: boolean };

let pickInFlight: Promise<ProfilePhotoPickOutcome> | null = null;

export async function getProfilePhotoCameraPermission(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  const permission = await ImagePicker.getCameraPermissionsAsync();
  return {
    granted: permission.granted,
    canAskAgain: permission.canAskAgain,
  };
}

/**
 * Camera pick only — defers storage upload until the caller saves the profile.
 */
export async function pickProfilePhotoFromCamera(): Promise<ProfilePhotoPickOutcome> {
  if (pickInFlight) {
    return pickInFlight;
  }

  pickInFlight = (async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return { kind: 'permission_denied', canAskAgain: permission.canAskAgain };
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled) {
      return { kind: 'cancelled' };
    }

    const [asset] = result.assets;
    if (!asset?.uri) {
      throw new Error('The photo could not be read.');
    }

    const bytes = await readUriBytes(asset.uri);
    return { kind: 'picked', uri: asset.uri, bytes };
  })();

  try {
    return await pickInFlight;
  } finally {
    pickInFlight = null;
  }
}

export async function uploadProfilePhotoBytes(
  userId: string,
  bytes: Uint8Array,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const path = `${userId}/avatar.jpg`;
  await uploadPrivateObject(AVATAR_BUCKET, path, bytes, 'image/jpeg', onProgress);

  const { error } = await supabase.rpc('confirm_avatar_capture', { p_storage_path: path });
  if (error) throw error;
}

/**
 * Single in-flight capture for the app — avoids duplicate camera prompts when several
 * surfaces check eligibility at once.
 */
export async function captureProfilePhotoInApp(
  userId: string,
  onProgress?: (fraction: number) => void,
): Promise<ProfilePhotoCaptureOutcome> {
  const picked = await pickProfilePhotoFromCamera();
  if (picked.kind === 'cancelled') {
    return { kind: 'cancelled' };
  }
  if (picked.kind === 'permission_denied') {
    return { kind: 'permission_denied', canAskAgain: picked.canAskAgain };
  }

  await uploadProfilePhotoBytes(userId, picked.bytes, onProgress);
  return { kind: 'saved' };
}