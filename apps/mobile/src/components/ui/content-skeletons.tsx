import { View } from 'react-native';

import { SkeletonBlock } from '@/components/ui/Skeleton';

/** Activity / notifications style row cards */
export function ActivityCardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View className="gap-3 px-5 py-2">
      {Array.from({ length: count }, (_, index) => (
        <View key={index} className="gap-2 rounded-2xl border border-hairline bg-elevated p-4">
          <SkeletonBlock className="h-5 w-3/4 rounded-lg" />
          <SkeletonBlock className="h-4 w-full rounded-lg" />
          <SkeletonBlock className="h-4 w-1/2 rounded-lg" />
        </View>
      ))}
    </View>
  );
}

export function SearchResultListSkeleton() {
  return (
    <View className="gap-3 px-4">
      <SkeletonBlock className="h-16 w-full rounded-2xl" />
      <SkeletonBlock className="h-16 w-full rounded-2xl" />
      <SkeletonBlock className="h-16 w-full rounded-2xl" />
    </View>
  );
}

export function WalletHomeSkeleton() {
  return (
    <View className="gap-4 px-5 pt-2">
      <SkeletonBlock className="h-36 w-full rounded-3xl" />
      <View className="flex-row gap-3">
        <SkeletonBlock className="h-12 flex-1 rounded-xl" />
        <SkeletonBlock className="h-12 flex-1 rounded-xl" />
      </View>
      <SkeletonBlock className="mt-2 h-6 w-32 rounded-lg" />
      <ActivityCardListSkeleton count={3} />
    </View>
  );
}

export function PublicProfileSkeleton() {
  return (
    <View className="items-center gap-4 px-5 pt-4">
      <SkeletonBlock className="h-24 w-24 rounded-full" />
      <SkeletonBlock className="h-6 w-40 rounded-lg" />
      <SkeletonBlock className="h-4 w-28 rounded-lg" />
      <SkeletonBlock className="h-12 w-full max-w-sm rounded-2xl" />
      <SkeletonBlock className="h-20 w-full rounded-2xl" />
    </View>
  );
}

export function ProjectDetailSkeleton() {
  return <RequestDetailSkeleton />;
}

export function RequestDetailSkeleton() {
  return (
    <View className="gap-4 px-5 pt-4">
      <SkeletonBlock className="h-56 w-full rounded-2xl" />
      <SkeletonBlock className="h-7 w-3/4 rounded-lg" />
      <SkeletonBlock className="h-4 w-full rounded-lg" />
      <SkeletonBlock className="h-4 w-5/6 rounded-lg" />
      <SkeletonBlock className="h-12 w-full rounded-xl" />
    </View>
  );
}

export function SettingsMenuSkeleton() {
  return (
    <View className="gap-6 px-5 pt-2">
      <SkeletonBlock className="h-32 w-full rounded-2xl" />
      <SkeletonBlock className="h-32 w-full rounded-2xl" />
      <SkeletonBlock className="h-24 w-full rounded-2xl" />
    </View>
  );
}

export function ReviewListSkeleton() {
  return (
    <View className="gap-3 px-5">
      {Array.from({ length: 3 }, (_, index) => (
        <View key={index} className="gap-2 rounded-2xl bg-surface p-4">
          <SkeletonBlock className="h-4 w-24 rounded-lg" />
          <SkeletonBlock className="h-4 w-full rounded-lg" />
        </View>
      ))}
    </View>
  );
}