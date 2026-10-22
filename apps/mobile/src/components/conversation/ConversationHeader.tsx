import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { IdentityVerifiedBadge } from '@/components/profile/IdentityVerifiedBadge';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';

export function ConversationHeader({
  counterpartyName,
  counterpartyAvatarPath,
  counterpartyIdentityVerified = false,
  requestTitle,
  statusLabel,
  onBack,
  actions,
}: {
  counterpartyName: string | null;
  counterpartyAvatarPath: string | null;
  counterpartyIdentityVerified?: boolean;
  requestTitle: string;
  statusLabel?: string | null;
  onBack: () => void;
  actions?: ReactNode;
}) {
  const firstName = counterpartyName?.trim().split(/\s+/)[0] ?? 'Chat';

  return (
    <View className="border-b border-hairline bg-canvas px-2 pb-3 pt-1">
      <View className="flex-row items-center gap-1">
        <IconButton icon="chevron-back" accessibilityLabel="Go back" onPress={onBack} />
        <Pressable
          accessibilityRole="header"
          className="min-w-0 flex-1 flex-row items-center gap-3 py-1"
        >
          <Avatar
            path={counterpartyAvatarPath}
            name={counterpartyName}
            size="sm"
            verified={counterpartyIdentityVerified}
          />
          <View className="min-w-0 flex-1 gap-0.5">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-lg font-bold text-ink" numberOfLines={1}>
                {firstName}
              </Text>
              {counterpartyIdentityVerified ? <IdentityVerifiedBadge /> : null}
            </View>
            <Text className="text-sm text-muted" numberOfLines={2}>
              {requestTitle}
            </Text>
            {statusLabel ? (
              <Text className="text-xs text-muted" numberOfLines={1}>
                {statusLabel}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {actions ? <View className="shrink-0 flex-row items-center">{actions}</View> : null}
      </View>
    </View>
  );
}
