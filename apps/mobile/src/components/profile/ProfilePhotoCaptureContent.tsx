import { Text, View } from 'react-native';

import { AvatarWithViewer } from '@/components/profile/AvatarWithViewer';
import { InlineError } from '@/components/ui/StateView';

export type ProfilePhotoCaptureVariant = 'respond' | 'chat';

type ProfilePhotoCaptureContentProps = {
  variant: ProfilePhotoCaptureVariant;
  avatarPath: string | null | undefined;
  displayName: string | null | undefined;
  error: Error | null;
  permissionBlocked?: boolean;
  compact?: boolean;
};

export function profilePhotoCaptureCopy(variant: ProfilePhotoCaptureVariant): {
  title: string;
  description: string;
} {
  if (variant === 'chat') {
    return {
      title: 'Take a moment before you chat',
      description:
        'Take your profile photo using your camera to start messaging on Active.',
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
}: ProfilePhotoCaptureContentProps) {
  const { title, description } = profilePhotoCaptureCopy(variant);

  return (
    <View className={compact ? 'gap-3' : 'gap-5'}>
      <View className="items-center gap-3">
        <AvatarWithViewer
          path={avatarPath}
          name={displayName ?? null}
          size={compact ? 'md' : 'lg'}
        />
        <Text
          className={
            compact
              ? 'text-center text-lg font-bold leading-7 text-ink'
              : 'text-center text-3xl font-bold leading-9 text-ink'
          }
        >
          {title}
        </Text>
        <Text
          className={
            compact
              ? 'text-center text-sm leading-5 text-muted'
              : 'max-w-sm text-center text-base leading-6 text-muted'
          }
        >
          {description}
        </Text>
        {permissionBlocked ? (
          <Text className="text-center text-sm leading-5 text-warning">
            Camera access is off. Open settings to allow your camera, then try again.
          </Text>
        ) : null}
      </View>
      {error ? <InlineError error={error} /> : null}
    </View>
  );
}
