import { Screen } from '@/components/ui/Screen';
import { UnifiedActivityFeed } from '@/components/UnifiedActivityFeed';

/** Same unified feed as Activity — requests you created live here too. */
export default function RequestsScreen() {
  return (
    <Screen>
      <UnifiedActivityFeed showHeader={false} />
    </Screen>
  );
}
