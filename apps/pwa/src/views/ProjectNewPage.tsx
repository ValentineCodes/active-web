'use client';

import { ProjectCreateWizard } from '@/components/project-flow/ProjectCreateWizard';
import { useRouter } from '@/lib/navigation';

export function ProjectNewPage() {
  const router = useRouter();
  return (
    <ProjectCreateWizard onClose={() => router.back()} onSuccess={(href) => router.replace(href)} />
  );
}