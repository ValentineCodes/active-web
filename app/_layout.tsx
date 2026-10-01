import '../global.css';

import { ActivityIndicator, Text, View } from 'react-native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { ErrorState } from '@/components/ui/StateView';
import { SessionProvider, useSession } from '@/features/auth/session';
import { profileQueryOptions } from '@/features/profile/api';
import { queryClient } from '@/lib/query/client';
import { colors } from '@/theme';

function BootScreen() {
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
 * Three mutually exclusive shells: signing in, finishing a profile, and the app itself.
 *
 * Nothing here touches location. A new user reaches Home without ever being asked where
 * they are; that question only arrives when they submit a request or browse nearby.
 */
function RootNavigator() {
  const { session, isRestoring } = useSession();

  const profileQuery = useQuery({
    ...profileQueryOptions(session?.user.id ?? ''),
    enabled: Boolean(session),
  });

  if (isRestoring || (session && profileQuery.isPending)) return <BootScreen />;

  if (session && profileQuery.isError) {
    return (
      <View className="flex-1 bg-canvas">
        <ErrorState error={profileQuery.error} onRetry={() => profileQuery.refetch()} />
      </View>
    );
  }

  const profile = profileQuery.data;

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
        <Stack.Screen name="profile" />
        <Stack.Screen name="wallet" />
        <Stack.Screen name="request/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="request/[id]" />
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
            <BottomSheetModalProvider>
              <StatusBar style="dark" />
              <RootNavigator />
            </BottomSheetModalProvider>
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
