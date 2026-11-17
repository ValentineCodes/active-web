'use client';

import { AvatarWithViewer } from '@/components/profile/AvatarWithViewer';
import { InlineError } from '@/components/ui/StateView';

export type ProfilePhotoCaptureVariant = 'respond' | 'chat';

export function profilePhotoCaptureCopy(variant: ProfilePhotoCaptureVariant): {
  title: string;
  description: string;
} {
  if (variant === 'chat') {
    return {
      title: 'Take a moment before you chat',
      description: 'Take your profile photo using your camera to start messaging on Active.',
    };
  }

  return {
    title: 'Add a profile photo',
    description:
      'People see your photo when you respond. Take one now with your camera — it only takes a moment.',
  };
}

export function ProfilePhotoCaptureContent({
  variant,
  avatarPath,
  displayName,
  error,
  permissionBlocked,
  compact,
}: {
  variant: ProfilePhotoCaptureVariant;
  avatarPath: string | null | undefined;
  displayName: string | null | undefined;
  error: Error | null;
  permissionBlocked?: boolean;
  compact?: boolean;
}) {
  const { title, description } = profilePhotoCaptureCopy(variant);

  return (
    <div className={compact ? 'flex flex-col gap-3' : 'flex flex-col gap-5'}>
      <div className="flex flex-col items-center gap-3">
        <AvatarWithViewer path={avatarPath} name={displayName ?? null} size={compact ? 'md' : 'lg'} />
        <h2
          className={
            compact
              ? 'text-center text-lg font-bold leading-7 text-ink'
              : 'text-center text-3xl font-bold leading-9 text-ink'
          }
        >
          {title}
        </h2>
        <p
          className={
            compact
              ? 'text-center text-sm leading-5 text-muted'
              : 'max-w-sm text-center text-base leading-6 text-muted'
          }
        >
          {description}
        </p>
        {permissionBlocked ? (
          <p className="text-center text-sm leading-5 text-warning">
            Camera access is off. Open settings to allow your camera, then try again.
          </p>
        ) : null}
      </div>
      {error ? <InlineError error={error} /> : null}
    </div>
  );
}