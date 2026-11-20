import { Stack } from 'expo-router';

/** Legacy activity routes redirect into Profile; keep stack for deep links only. */
export default function ActivityLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}