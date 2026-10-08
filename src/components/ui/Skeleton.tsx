import { View, type ViewProps } from 'react-native';

import { cn } from '@/lib/cn';

export function SkeletonBlock({ className, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn('rounded-lg bg-surface', className)}
      {...props}
    />
  );
}
