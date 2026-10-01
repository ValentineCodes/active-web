import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ToastProvider as Provider, useToast } from 'react-native-toast-notifications';

import { registerAppToast } from '@/lib/toast';
import { colors, shadow } from '@/theme';

type Props = {
  children: React.ReactNode;
};

type ToastType = 'success' | 'danger' | 'warning' | 'info' | string | undefined;

function borderColor(type: ToastType) {
  switch (type) {
    case 'success':
      return colors.active;
    case 'danger':
      return colors.danger;
    case 'warning':
      return colors.warning;
    case 'info':
      return colors.info;
    default:
      return colors.hairline;
  }
}

function iconColor(type: ToastType) {
  switch (type) {
    case 'success':
      return colors.active;
    case 'danger':
      return colors.danger;
    case 'warning':
      return colors.warning;
    case 'info':
      return colors.info;
    default:
      return colors.subtle;
  }
}

function iconName(type: ToastType): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'success':
      return 'checkmark-circle-outline';
    case 'danger':
      return 'alert-circle-outline';
    case 'warning':
      return 'warning-outline';
    case 'info':
      return 'information-circle-outline';
    default:
      return 'chatbubble-ellipses-outline';
  }
}

export function ToastProvider({ children }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Provider
      placement="top"
      duration={3500}
      animationType="zoom-in"
      animationDuration={250}
      offset={insets.top + 12}
      swipeEnabled
      renderToast={({ message, type }) => {
        const accent = borderColor(type);
        return (
          <View
            className="max-w-[90%] flex-row items-center gap-2 rounded-3xl border border-hairline bg-elevated p-4"
            style={[
              shadow.raised,
              {
                borderLeftWidth: 6,
                borderRightWidth: 6,
                borderLeftColor: accent,
                borderRightColor: accent,
              },
            ]}
          >
            <Ionicons name={iconName(type)} size={22} color={iconColor(type)} />
            <Text className="flex-1 text-base text-ink">{message}</Text>
          </View>
        );
      }}
    >
      <ToastRegistrar />
      {children}
    </Provider>
  );
}

function ToastRegistrar() {
  const toast = useToast();

  useEffect(() => {
    registerAppToast((message, options) => {
      toast.show(message, options);
    });
    return () => registerAppToast(null);
  }, [toast]);

  return null;
}

export { useToast } from 'react-native-toast-notifications';
