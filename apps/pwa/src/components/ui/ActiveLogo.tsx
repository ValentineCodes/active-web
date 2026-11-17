import { cn } from '@/lib/cn';

/** Crown mark from `apps/mobile/assets/images/logo.png` (welcome screen parity). */
export function ActiveLogo({
  size = 160,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/images/logo.png"
      alt="Active"
      width={size}
      height={size}
      className={cn('object-contain', className)}
    />
  );
}