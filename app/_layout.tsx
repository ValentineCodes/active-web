import '../global.css';

import { ActivityIndicator, Text, View } from 'react-native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { ErrorState } from '@/components/ui/StateView';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { SessionProvider, useSession } from '@/features/auth/session';
import { profileQueryOptions } from '@/features/profile/api';
import { queryClient } from '@/lib/query/client';
import { AppFontsProvider } from '@/theme/AppFontsProvider';
import { ThemeProvider, useColors } from '@/theme';
import { ThemeStatusBar } from '@/theme/ThemeStatusBar';

function BootScreen() {
  const colors = useColors();
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-soft">
        <Ionicons name="radio-outline" size={30} color={colors.brand} />
      </View>
      <Text className="text-2xl font-bold text-ink">Active</Text>
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}

/**
 * Three shells: sign-in, onboarding (profile loaded but no name), and the signed-in app.
 * While the profile query is still pending, the main app shell renders with screen skeletons
 * instead of blocking on a full-screen boot spinner.
 */
function RootNavigator() {
  const { session, isRestoring } = useSession();

  const profileQuery = useQuery({
    ...profileQueryOptions(session?.user.id ?? ''),
    enabled: Boolean(session),
  });

  if (isRestoring) return <BootScreen />;

  if (session && profileQuery.isError) {
    return (
      <View className="flex-1 bg-canvas">
        <ErrorState error={profileQuery.error} onRetry={() => profileQuery.refetch()} />
      </View>
    );
  }

  const profile = profileQuery.data;

  const isSignedIn = Boolean(session);
  const needsProfile = isSignedIn && profileQuery.isSuccess && !profile?.display_name;
  const showSignedInApp =
    isSignedIn &&
    (profileQuery.isPending || (profileQuery.isSuccess && Boolean(profile?.display_name)));

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={needsProfile}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={showSignedInApp}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="profile/edit" />
        <Stack.Screen name="wallet" />
        <Stack.Screen name="request/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="request/[id]" />
        <Stack.Screen name="respond/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="engagement/[id]" />
        <Stack.Screen name="conversation/[id]" />
        <Stack.Screen name="rate/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="notification-settings" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AppFontsProvider fallback={<BootScreen />}>
              <SessionProvider>
                <ToastProvider>
                  <BottomSheetModalProvider>
                    <ThemeStatusBar />
                    <RootNavigator />
                  </BottomSheetModalProvider>
                </ToastProvider>
              </SessionProvider>
            </AppFontsProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
