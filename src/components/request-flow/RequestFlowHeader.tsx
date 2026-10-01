import { Alert } from 'react-native';

import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';

export function RequestFlowHeader({
  title,
  onBack,
  menuActions,
}: {
  title: string;
  onBack: () => void;
  menuActions?: { label: string; onPress: () => void; destructive?: boolean }[];
}) {
  const onMore = menuActions?.length
    ? () => {
        Alert.alert(
          'Options',
          undefined,
          [
            ...menuActions.map((action) => ({
              text: action.label,
              style: (action.destructive ? 'destructive' : 'default') as 'default' | 'destructive',
              onPress: action.onPress,
            })),
            { text: 'Cancel', style: 'cancel' },
          ],
          { cancelable: true },
        );
      }
    : undefined;

  return (
    <Header
      title={title}
      onBack={onBack}
      right={
        onMore ? (
          <IconButton
            icon="ellipsis-horizontal"
            accessibilityLabel="More options"
            onPress={onMore}
          />
        ) : undefined
      }
    />
  );
}
