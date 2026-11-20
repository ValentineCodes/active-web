import { Redirect, useLocalSearchParams } from 'expo-router';

/** Legacy modal entry → dedicated Search tab (not Home `q=`). */
export default function LegacySearchRedirectScreen() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  const trimmed = typeof q === 'string' ? q.trim() : '';
  if (trimmed) {
    return <Redirect href={`/(tabs)/search?q=${encodeURIComponent(trimmed)}`} />;
  }
  return <Redirect href="/(tabs)/search" />;
}