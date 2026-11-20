import { Switch, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { InlineError, LoadingState } from '@/components/ui/StateView';
import { useMyReputation, useSetCrownPublic } from '@/features/profile/reputation-api';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme';

export default function PrivacySettingsScreen() {
  const colors = useColors();
  const reputation = useMyReputation();
  const setCrownPublic = useSetCrownPublic();
  const crownVisible = reputation.data?.crown_public ?? true;

  if (showQuerySkeleton(reputation)) {
    return (
      <Screen>
        <Header title="Privacy" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Privacy" onBack={() => router.back()} />
      <View className="gap-4 px-5 pt-2">
        <View className="overflow-hidden rounded-2xl border border-hairline bg-elevated px-4 py-4">
          <View className="flex-row items-center justify-between gap-4">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-lg font-semibold text-ink">Show Crown on public profile</Text>
              <Text className="text-sm leading-5 text-muted">
                When off, others cannot see your Crown tier or points. Your reputation is unchanged
                and you still see your full Crown here.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Show Crown on public profile"
              value={crownVisible}
              disabled={setCrownPublic.isPending}
              onValueChange={(next) => {
                setCrownPublic.mutate(next, {
                  onSuccess: () => {
                    showAppToast(next ? 'Crown is visible publicly' : 'Crown hidden on public profile', {
                      type: 'success',
                    });
                  },
                  onError: (error) => {
                    showAppToast(
                      error instanceof Error ? error.message : 'Could not update Crown visibility.',
                      'warning',
                    );
                  },
                });
              }}
              trackColor={{ false: colors.hairline, true: colors.active }}
            />
          </View>
        </View>
        {setCrownPublic.isError ? <InlineError error={setCrownPublic.error} /> : null}
      </View>
    </Screen>
  );
}