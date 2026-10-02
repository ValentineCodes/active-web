import { ActivityIndicator, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { useRequestAttachmentUrl } from '@/features/requests/request-attachment-url';
import { useColors } from '@/theme';

type RequestAttachmentSectionProps = {
  attachmentPath: string | null | undefined;
};

export function RequestAttachmentSection({ attachmentPath }: RequestAttachmentSectionProps) {
  const colors = useColors();
  const signedUrl = useRequestAttachmentUrl(attachmentPath);

  if (!attachmentPath) return null;

  return (
    <View className="gap-3 border-y border-hairline py-5">
      <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
        Request attachment
      </Text>
      <View
        className="w-full items-center justify-center overflow-hidden rounded-2xl bg-surface"
        style={{ aspectRatio: 4 / 3 }}
      >
        {signedUrl.isPending ? (
          <ActivityIndicator color={colors.subtle} />
        ) : signedUrl.data ? (
          <Image
            source={{ uri: signedUrl.data }}
            accessibilityLabel="Request photo"
            contentFit="cover"
            className="h-full w-full"
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <Text className="px-4 text-center text-sm text-muted">Could not load this photo.</Text>
        )}
      </View>
    </View>
  );
}
