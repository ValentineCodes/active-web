export type CameraEnvironmentResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'insecure_context' | 'permission_denied' };

export function evaluateCameraEnvironment(hasGetUserMedia: boolean, isSecureContext: boolean): CameraEnvironmentResult {
  if (!isSecureContext) return { ok: false, reason: 'insecure_context' };
  if (!hasGetUserMedia) return { ok: false, reason: 'unsupported' };
  return { ok: true };
}

export function cameraEnvironmentErrorMessage(result: Extract<CameraEnvironmentResult, { ok: false }>): string {
  if (result.reason === 'insecure_context') {
    return 'Camera access requires HTTPS. Open Active over a secure connection.';
  }
  if (result.reason === 'unsupported') {
    return 'This browser does not support in-app camera capture. Try Safari or Chrome on your phone.';
  }
  return 'Camera access was denied. Allow camera permission in your browser settings and try again.';
}
