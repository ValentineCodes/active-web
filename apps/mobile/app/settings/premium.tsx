import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';

import { SettingsGroup, SettingsRow } from '@/components/settings/SettingsRows';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import {
  useMyEntitlements,
  useStartPremiumTrial,
} from '@/features/projects/project-api';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { showAppToast } from '@/lib/toast';

export default function PremiumSettingsScreen() {
  const entitlements = useMyEntitlements();
  const startTrial = useStartPremiumTrial();

  if (showQuerySkeleton(entitlements)) {
    return (
      <Screen>
        <Header title="Collaborative projects" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  const data = entitlements.data;
  const trialUsed = Boolean(data?.premium_trial_started_at);
  const active = data?.premium_active ?? false;

  return (
    <Screen>
      <Header title="Collaborative projects" onBack={() => router.back()} />
      <View className="gap-4 px-5 pt-2">
        <View className="gap-2 rounded-2xl border border-hairline bg-elevated p-4">
          <Text className="text-lg font-semibold text-ink">Premium (projects)</Text>
          <Text className="text-sm leading-5 text-muted">
            Premium unlocks creating new collaborative Projects. It is separate from Crown conduct
            points. No payment card is required for the one-time 30-day trial.
          </Text>
          <Text className="text-sm font-medium text-ink">
            Status · {active ? 'Trial active' : trialUsed ? 'Trial ended' : 'Standard (no trial yet)'}
          </Text>
          {data?.premium_trial_ends_at ? (
            <Text className="text-sm text-muted">
              Trial ends {format(new Date(data.premium_trial_ends_at), 'MMM d, yyyy')}
            </Text>
          ) : null}
          <Text className="text-xs text-subtle">
            Projects you already created stay available after Premium expires. Only new project
            creation requires an active entitlement (server enforced).
          </Text>
        </View>

        {!trialUsed ? (
          <Button
            label={startTrial.isPending ? 'Starting trial…' : 'Start 30-day Premium trial'}
            onPress={() =>
              startTrial.mutate(undefined, {
                onSuccess: () => {
                  showAppToast('Premium trial started', { type: 'success' });
                  void entitlements.refetch();
                },
                onError: (error) =>
                  showAppToast(
                    error instanceof Error ? error.message : 'Could not start trial',
                    'warning',
                  ),
              })
            }
            loading={startTrial.isPending}
          />
        ) : !active ? (
          <EmptyState
            layout="list"
            icon="time-outline"
            title="Trial ended"
            message="You can still manage existing projects. Paid Premium plans are not configured in this release."
          />
        ) : null}

        <SettingsGroup title="Projects">
          <SettingsRow
            label="Create a project"
            description={data?.can_create_projects ? 'Available during your trial' : 'Requires active Premium'}
            onPress={() => router.push('/project/new')}
          />
        </SettingsGroup>

        {entitlements.isError ? <InlineError error={entitlements.error} /> : null}
        {startTrial.isError ? <InlineError error={startTrial.error} /> : null}
      </View>
    </Screen>
  );
}