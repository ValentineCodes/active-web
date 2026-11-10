'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { cn } from '@/lib/cn';

/** Native-style pushed screen: `Screen` + flat `Header` + scroll body. */
export function FlowScreen({
  title,
  backTo,
  onBack,
  right,
  children,
  className,
  bodyClassName,
  footer,
}: {
  title: string;
  backTo?: string;
  onBack?: () => void;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const handleBack = onBack ?? (backTo != null ? () => router.push(backTo) : () => router.back());

  return (
    <Screen className={cn('min-h-[100dvh]', className)}>
      <Header title={title} onBack={handleBack} right={right} />
      <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-2', bodyClassName)}>{children}</div>
      {footer}
    </Screen>
  );
}
