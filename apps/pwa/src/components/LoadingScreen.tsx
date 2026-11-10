import { LoadingState } from '@/components/ui/StateView';
import { Screen } from '@/components/ui/Screen';

export function LoadingScreen({ label }: { label?: string }) {
  return (
    <Screen>
      <LoadingState label={label} />
    </Screen>
  );
}
