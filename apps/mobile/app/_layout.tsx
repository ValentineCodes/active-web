import '../global.css';

import { useEffect, type ReactNode } from 'react';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';

import { ToastProvider } from '@/components/ui/ToastProvider';
import { consumeSessionExpiredOnEntryToast } from '@/features/auth/session-expired-toast';
import { SignInFlowProvider, useSignInFlow } from '@/features/auth/sign-in-flow';
import { SessionProvider, useSession } from '@/features/auth/session';
import { AppReadyGate } from '@/features/auth/splash-gate';
import { showAppToast } from '@/lib/toast';
import '@/features/requests/tag-catalogue-storage';
import { queryClient } from '@/lib/query/client';
import { queryPersistOptions } from '@/lib/query/persist';
import { ThemeProvider } from '@/theme';
import { ThemeStatusBar } from '@/theme/ThemeStatusBar';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

function AppBottomSheetProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <BottomSheetModalProvider topInset={insets.top} bottomInset={insets.bottom}>
      {children}
    </BottomSheetModalProvider>
  );
}

function RootNavigator() {
  const { session } = useSession();
  const { completingPhoneOtp } = useSignInFlow();

  useEffect(() => {
    if (session) return;
    if (consumeSessionExpiredOnEntryToast()) {
      showAppToast('Your session has expired', { type: 'info' });
    }
  }, [session]);

  const showAuthStack = !session || completingPhoneOtp;
  const showSignedInApp = Boolean(session) && !completingPhoneOtp;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={showAuthStack}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={showSignedInApp}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="profile/edit" />
        <Stack.Screen name="profile/locations" />
        <Stack.Screen name="profile/bank-accounts/index" />
        <Stack.Screen name="profile/bank-accounts/add" />
        <Stack.Screen name="wallet" />
        <Stack.Screen
          name="search"
          options={{
            presentation: 'modal',
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
    <GestureHandlerRootView className="flex-1 bg-canvas">
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={queryPersistOptions}>
          <ThemeProvider>
            <SessionProvider>
              <SignInFlowProvider>
                <AppReadyGate>
                  <ToastProvider>
                    <AppBottomSheetProvider>
                      <ThemeStatusBar />
                      <RootNavigator />
                    </AppBottomSheetProvider>
                  </ToastProvider>
                </AppReadyGate>
              </SignInFlowProvider>
            </SessionProvider>
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
