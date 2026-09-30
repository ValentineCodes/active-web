import { Screen } from '@/components/ui/Screen';
import { UnifiedActivityFeed } from '@/components/UnifiedActivityFeed';

export default function ActivityScreen() {
  return (
    <Screen>
      <UnifiedActivityFeed showHeader={false} />
    </Screen>
  );
}
