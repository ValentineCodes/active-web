import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { RequestMessage } from '@/features/requests/conversation-message-model';
import { viewerFacingSystemMessageBody } from '@/features/requests/conversation-system-message-display';
import { cn } from '@/lib/cn';
import { useColors } from '@/theme';

function lifecycleKey(message: RequestMessage): string {
  const meta = message.metadata;
  if (!meta || typeof meta !== 'object') return '';
  if ('lifecycle_key' in meta && typeof meta.lifecycle_key === 'string') return meta.lifecycle_key;
  return '';
}

/** Centered timeline chip — not a chat bubble. */
export function SystemMessageRow({
  message,
  viewerUserId,
}: {
  message: RequestMessage;
  viewerUserId?: string | null;
}) {
  const colors = useColors();
  const displayBody = viewerFacingSystemMessageBody(message, viewerUserId);
  const key = lifecycleKey(message);
  const completionLike =
    key.includes('complete') ||
    /marked the request as complete/i.test(message.body) ||
    displayBody.startsWith('You marked');
  const iconName = completionLike ? 'checkmark-circle-outline' : 'information-circle-outline';

  return (
    <View className="w-full items-center px-2 py-1" accessibilityRole="text">
      <View
        className={cn(
          'max-w-sm flex-row items-start gap-2.5 rounded-2xl border px-3.5 py-2.5',
          completionLike ? 'border-active/25 bg-active-soft/70' : 'border-hairline bg-surface',
        )}
      >
        <View className="mt-0.5 h-7 w-7 items-center justify-center rounded-full bg-elevated">
          <Ionicons
            name={iconName}
            size={16}
            color={completionLike ? colors.active : colors.muted}
          />
        </View>
        <Text className="min-w-0 flex-1 text-left text-sm font-medium leading-5 text-muted">
          {displayBody}
        </Text>
      </View>
    </View>
  );
}