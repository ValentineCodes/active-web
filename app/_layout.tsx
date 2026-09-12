import '../global.css';

import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';

import { SessionProvider, useSession } from '@/features/auth/session';
import { profileQueryOptions } from '@/features/profile/api';
import { queryClient } from '@/lib/query/client';
import { colors } from '@/theme';

function BootScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas">
      <Text className="text-3xl font-bold text-ink">Active</Text>
      <ActivityIndicator color={colors.muted} />
    </View>
  );
}

/**
 * Three mutually exclusive shells: signing in, finishing a profile, and the app itself.
 *
 * Nothing here touches location. A new user reaches Home without ever being asked where
 * they are; that question only arrives when they submit a request or go Active.
 */
function RootNavigator() {
  const { session, isRestoring } = useSession();

  const { data: profile, isPending: isProfilePending } = useQuery({
    ...profileQueryOptions(session?.user.id ?? ''),
    enabled: Boolean(session),
  });

  if (isRestoring || (session && isProfilePending)) return <BootScreen />;

  const isSignedIn = Boolean(session);
  const needsProfile = isSignedIn && !profile?.display_name;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={needsProfile}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={isSignedIn && !needsProfile}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="request/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="request/[id]" />
        <Stack.Screen name="go-active" options={{ presentation: 'modal' }} />
        <Stack.Screen name="respond/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="engagement/[id]" />
        <Stack.Screen name="rate/[id]" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
