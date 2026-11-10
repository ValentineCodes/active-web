'use client';

import { Header } from '@/components/ui/Header';

export function RequestFlowHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return <Header title={title} onBack={onBack} />;
}
