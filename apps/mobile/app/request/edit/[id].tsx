import { useLocalSearchParams } from 'expo-router';

import { NewRequestForm } from '../new';

export default function EditRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NewRequestForm editRequestId={id} />;
}
