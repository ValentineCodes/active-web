import { Skeleton } from '@/components/ui/skeleton';

export default function OverviewLoading() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
