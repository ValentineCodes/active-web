import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { cn } from '@/lib/cn';

/** Wizard-style layout: main content scrolls; footer stays above the software keyboard. */
export function KeyboardStickyFooter({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer: ReactNode;
  className?: string;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className={cn('flex-1', className)}
    >
      {children}
      {footer}
    </KeyboardAvoidingView>
  );
}
