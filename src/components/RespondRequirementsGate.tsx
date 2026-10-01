import { Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { InlineError } from '@/components/ui/StateView';
import {
  locationRequirementMessage,
  type RespondRequirementBlocker,
} from '@/features/requests/respond-requirements';
import { useCaptureProfilePhoto, useProfile } from '@/features/profile/api';
import { showAppToast } from '@/lib/toast';

type RespondRequirementsGateProps = {
  blocker: RespondRequirementBlocker;
  checking: boolean;
  onRecheck: () => void;
};

/** Lightweight gate shown right before the two-step response flow. */
export function RespondRequirementsGate({
  blocker,
  checking,
  onRecheck,
}: RespondRequirementsGateProps) {
  const profile = useProfile();
  const capturePhoto = useCaptureProfilePhoto();

  if (blocker.kind === 'photo') {
    return (
      <View className="gap-6 p-5">
        <View className="items-center gap-3">
          <Avatar
            path={profile.data?.avatar_path}
            name={profile.data?.display_name ?? null}
            size="lg"
          />
          <Text className="text-center text-2xl font-bold text-ink">Add a profile photo</Text>
          <Text className="max-w-sm text-center text-base text-muted">
            People see your photo when you respond. Take one now with your camera — it only takes a
            moment.
          </Text>
        </View>

        {capturePhoto.isError ? <InlineError error={capturePhoto.error} /> : null}

        <Button
          label={capturePhoto.isPending ? 'Opening camera…' : 'Take profile photo'}
          size="lg"
          loading={capturePhoto.isPending}
          onPress={() =>
            capturePhoto.mutate(
              {},
              {
                onSuccess: (saved) => {
                  if (saved) {
                    showAppToast('Profile updated');
                    onRecheck();
                  }
                },
              },
            )
          }
        />
      </View>
    );
  }

  if (blocker.kind === 'location') {
    return (
      <View className="gap-6 p-5">
        <Text className="text-2xl font-bold text-ink">Location needed</Text>
        <Text className="text-base text-muted">{locationRequirementMessage(blocker.reason)}</Text>
        <Button
          label={checking ? 'Checking…' : 'Share location'}
          size="lg"
          loading={checking}
          onPress={onRecheck}
        />
      </View>
    );
  }

  return (
    <View className="gap-6 p-5">
      <Text className="text-2xl font-bold text-ink">Can&apos;t respond yet</Text>
      <Text className="text-base text-muted">{blocker.message}</Text>
      <Button label="Try again" size="lg" loading={checking} onPress={onRecheck} />
    </View>
  );
}
