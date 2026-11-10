import { describe, expect, it } from 'vitest';

import { cameraEnvironmentErrorMessage, evaluateCameraEnvironment } from '@/features/profile/camera-environment';

describe('camera environment', () => {
  it('requires secure context and getUserMedia', () => {
    expect(evaluateCameraEnvironment(true, true)).toEqual({ ok: true });
    expect(evaluateCameraEnvironment(false, true)).toEqual({ ok: false, reason: 'unsupported' });
    expect(evaluateCameraEnvironment(true, false)).toEqual({ ok: false, reason: 'insecure_context' });
  });

  it('maps errors to user-facing copy', () => {
    expect(cameraEnvironmentErrorMessage({ ok: false, reason: 'permission_denied' })).toMatch(/denied/i);
  });
});
