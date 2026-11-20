import { useLocalSearchParams } from 'expo-router';

import { ProjectDetailScreen } from '@/components/projects/ProjectDetailScreen';

export default function ProjectRouteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <ProjectDetailScreen projectId={id} />;
}