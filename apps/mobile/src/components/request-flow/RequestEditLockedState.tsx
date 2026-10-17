import { EmptyState } from '@/components/ui/StateView';
import {
  REQUEST_EDIT_LOCKED_MESSAGE,
  REQUEST_EDIT_LOCKED_TITLE,
} from '@/features/requests/request-edit-locked';

export function RequestEditLockedState({ onBack }: { onBack: () => void }) {
  return (
    <EmptyState
      layout="screen"
      icon="lock-closed-outline"
      title={REQUEST_EDIT_LOCKED_TITLE}
      message={REQUEST_EDIT_LOCKED_MESSAGE}
      action={{ label: 'Back to request', onPress: onBack }}
    />
  );
}
