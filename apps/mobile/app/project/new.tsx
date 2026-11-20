import { type Href, router } from 'expo-router';

import { ProjectCreateWizard } from '@/components/project-flow/ProjectCreateWizard';

export default function ProjectNewScreen() {
  return (
    <ProjectCreateWizard
      onClose={() => router.back()}
      onSuccess={(projectId) => router.replace(`/project/${projectId}` as Href)}
    />
  );
}