import { cn } from '@/lib/cn';

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface', className)} aria-hidden />;
}
