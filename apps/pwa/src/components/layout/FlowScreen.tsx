import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();
  const handleBack = onBack ?? (backTo != null ? () => navigate(backTo) : () => navigate(-1));

  return (
    <Screen className={cn('min-h-[100dvh]', className)}>
      <Header title={title} onBack={handleBack} right={right} />
      <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-2', bodyClassName)}>{children}</div>
      {footer}
    </Screen>
  );
}
