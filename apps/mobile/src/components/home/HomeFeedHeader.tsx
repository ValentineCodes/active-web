import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Avatar } from '@/components/ui/Avatar';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { hasProviderCommitments, type MyAttendance } from '@/features/attendance/api';
import { formatGreetingFirstName, formatGreetingPeriod, formatMoney } from '@/lib/format';
type HomeFeedHeaderProps = {
  loading: boolean;
  displayName: string | null;
  avatarPath: string | null;
  attendance: MyAttendance | undefined;
  walletAvailable: number | null;
  walletCurrency: string | null;
};

export function HomeFeedHeader({
  loading,
  displayName,
  avatarPath,
  attendance,
  walletAvailable,
  walletCurrency,
}: HomeFeedHeaderProps) {
  const firstName = formatGreetingFirstName(displayName);

  if (loading) {
    return (
      <View className="flex-row items-center justify-between gap-3 px-5 pb-2 pt-1">
        <View className="min-w-0 flex-1 flex-row items-center gap-3">
          <SkeletonBlock className="h-12 w-12 rounded-full" />
          <View className="min-w-0 flex-1 gap-2">
            <SkeletonBlock className="h-4 w-28 rounded-md" />
            <SkeletonBlock className="h-6 w-36 rounded-md" />
          </View>
        </View>
        <SkeletonBlock className="h-7 w-20 rounded-md" />
      </View>
    );
  }

  return (
    <View className="flex-row items-center justify-between gap-3 px-5 pb-2 pt-1">
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
          className="active:opacity-90"
        >
          <Avatar
            size="md"
            path={avatarPath}
            name={displayName}
            showActiveDot={hasProviderCommitments(attendance)}
          />
        </Pressable>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-sm leading-5 text-muted">{formatGreetingPeriod()}</Text>
          <Text className="text-2xl font-bold leading-8 text-ink" numberOfLines={1}>
            {firstName ?? 'Welcome'}
          </Text>
        </View>
      </View>

      {walletAvailable != null && walletCurrency ? (
        <Pressable
          onPress={() => router.push('/wallet')}
          accessibilityRole="button"
          accessibilityLabel={`Wallet balance ${formatMoney(walletAvailable, walletCurrency)}`}
          hitSlop={8}
          className="shrink-0 active:opacity-90"
        >
          <Text className="text-lg font-bold text-active">
            {formatMoney(walletAvailable, walletCurrency)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
