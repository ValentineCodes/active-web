import { Redirect, useLocalSearchParams } from 'expo-router';

/** Profile is a stack screen; keep this route for legacy tab/deep links. */
export default function ProfileTabRedirect() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  if (tab === 'responses' || tab === 'projects' || tab === 'requests') {
    return <Redirect href={{ pathname: '/profile', params: { tab } }} />;
  }
  return <Redirect href="/profile" />;
}