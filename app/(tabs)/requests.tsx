import { Redirect } from 'expo-router';

/** Legacy deep links — activity lives on the Activity tab. */
export default function RequestsScreen() {
  return <Redirect href="/(tabs)/activity" />;
}
