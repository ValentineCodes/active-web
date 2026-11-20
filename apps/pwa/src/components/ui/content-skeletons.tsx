import { SkeletonBlock } from '@/components/ui/Skeleton';

export function ActivityCardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-2xl border border-hairline bg-elevated p-4">
          <SkeletonBlock className="h-5 w-3/4" />
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function SearchResultListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4">
      <SkeletonBlock className="h-16 w-full rounded-2xl" />
      <SkeletonBlock className="h-16 w-full rounded-2xl" />
      <SkeletonBlock className="h-16 w-full rounded-2xl" />
    </div>
  );
}

export function PublicProfileSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4 px-5 pt-4">
      <SkeletonBlock className="h-24 w-24 rounded-full" />
      <SkeletonBlock className="h-6 w-40" />
      <SkeletonBlock className="h-4 w-28" />
      <SkeletonBlock className="h-12 w-full max-w-sm rounded-2xl" />
    </div>
  );
}