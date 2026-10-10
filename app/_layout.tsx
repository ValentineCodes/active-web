import '../global.css';

import { useEffect } from 'react';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

import { ToastProvider } from '@/components/ui/ToastProvider';
import { consumeSessionExpiredOnEntryToast } from '@/features/auth/session-expired-toast';
import { SessionProvider, useSession } from '@/features/auth/session';
import { AppReadyGate } from '@/features/auth/splash-gate';
import { showAppToast } from '@/lib/toast';
import { profileQueryOptions } from '@/features/profile/api';
import '@/features/requests/tag-catalogue-storage';
import { queryClient } from '@/lib/query/client';
import { queryPersistOptions } from '@/lib/query/persist';
import { ThemeProvider } from '@/theme';
import { ThemeStatusBar } from '@/theme/ThemeStatusBar';

function RootNavigator() {
  const { session } = useSession();

  const profileQuery = useQuery({
    ...profileQueryOptions(session?.user.id ?? ''),
    enabled: Boolean(session),
  });

  useEffect(() => {
    if (session) return;
    if (consumeSessionExpiredOnEntryToast()) {
      showAppToast('Your session has expired', { type: 'info' });
    }
  }, [session]);

  useEffect(() => {
    if (!session || !profileQuery.isSuccess) return;
    if (!profileQuery.data.display_name) {
      router.replace('/onboarding');
    }
  }, [profileQuery.data?.display_name, profileQuery.isSuccess, session]);

  const showSignedInApp = Boolean(session);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={showSignedInApp}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="profile/edit" />
        <Stack.Screen name="wallet" />
        <Stack.Screen
          name="search"
          options={{
            presentation: 'transparentModal',
            animation: 'fade',
          }}
        />
        <Stack.Screen name="request/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="request/edit/[id]" options={{ presentation: 'modal' }} />
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
        <PersistQueryClientProvider client={queryClient} persistOptions={queryPersistOptions}>
          <ThemeProvider>
            <SessionProvider>
              <AppReadyGate>
                <ToastProvider>
                  <BottomSheetModalProvider>
                    <ThemeStatusBar />
                    <RootNavigator />
                  </BottomSheetModalProvider>
                </ToastProvider>
              </AppReadyGate>
            </SessionProvider>
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
