import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ToastProvider as Provider, useToast } from 'react-native-toast-notifications';

import { registerAppToast } from '@/lib/toast';
import { useTheme } from '@/theme';

type Props = {
  children: React.ReactNode;
};

type ToastType = 'success' | 'danger' | 'warning' | 'info' | string | undefined;

type ToastData = { title?: string } | undefined;

function toastTitle(type: ToastType, data: ToastData) {
  if (data?.title) return data.title;
  switch (type) {
    case 'success':
      return 'Done';
    case 'warning':
      return 'Heads up';
    case 'info':
      return 'Update';
    case 'danger':
      return 'Something went wrong';
    default:
      return 'Notice';
  }
}

function iconBackground(type: ToastType, colors: ReturnType<typeof useTheme>['colors']) {
  switch (type) {
    case 'success':
      return colors.activeSoft;
    case 'danger':
      return colors.dangerSoft;
    case 'warning':
      return colors.warningSoft;
    case 'info':
      return colors.infoSoft;
    default:
      return colors.surface;
  }
}

function iconColor(type: ToastType, colors: ReturnType<typeof useTheme>['colors']) {
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
      return 'checkmark';
    case 'danger':
      return 'close';
    case 'warning':
      return 'alert';
    case 'info':
      return 'information';
    default:
      return 'chatbubble-ellipses';
  }
}

export function ToastProvider({ children }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Provider
      placement="top"
      duration={3500}
      animationType="slide-in"
      animationDuration={280}
      offset={insets.top + 8}
      swipeEnabled
      renderToast={({ message, type, data }) => {
        const title = toastTitle(type, data as ToastData);
        const subtitle = typeof message === 'string' ? message : '';
        return (
          <View className="w-11/12 flex-row items-center gap-3 rounded-2xl border border-hairline bg-elevated px-4 py-3.5">
            <View
              className="h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: iconBackground(type, colors) }}
            >
              <Ionicons name={iconName(type)} size={20} color={iconColor(type, colors)} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-base font-semibold leading-5 text-ink">{title}</Text>
              {subtitle ? (
                <Text className="mt-0.5 text-sm leading-5 text-subtle">{subtitle}</Text>
              ) : null}
            </View>
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
