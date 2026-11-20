import { FlatList, Text, View } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';

import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { CrownSummary } from '@/components/profile/CrownSummary';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { useMyReputation, useMyReputationHistory } from '@/features/profile/reputation-api';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';

export default function ReputationSettingsScreen() {
  const reputation = useMyReputation();
  const history = useMyReputationHistory();

  if (showQuerySkeleton(reputation)) {
    return (
      <Screen>
        <Header title="Crown & conduct" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  const rep = reputation.data;

  return (
    <Screen>
      <Header title="Crown & conduct" onBack={() => router.back()} />
      <FlatList
        data={history.data ?? []}
        keyExtractor={(item) => item.ledger_id}
        contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
        ListHeaderComponent={
          <View className="mb-2 gap-3">
            <Text className="text-sm leading-5 text-muted">
              Crown reflects conduct across Active. Points can rise and fall from recorded events.
              Gold Shield is separate from Premium.
            </Text>
            <CrownSummary
              tier={rep?.crown_tier ?? 'none'}
              points={rep?.points_main ?? 0}
              shield={rep?.shield_remaining ?? 0}
              nextTier={rep?.next_tier ?? null}
              pointsToNext={rep?.points_to_next_tier ?? null}
            />
            <Text className="text-base font-semibold text-ink">History</Text>
          </View>
        }
        ListEmptyComponent={
          history.isPending ? (
            <LoadingState label="Loading history…" />
          ) : history.isError ? (
            <InlineError error={history.error} />
          ) : (
            <EmptyState
              layout="list"
              icon="ribbon-outline"
              title="No recorded changes yet"
              message="Reputation adjustments from marketplace activity will appear here."
            />
          )
        }
        renderItem={({ item }) => (
          <View className="rounded-xl border border-hairline bg-elevated p-3">
            <Text className="text-base font-medium text-ink">{item.reason}</Text>
            <Text className="mt-1 text-sm text-muted">
              {item.delta_main !== 0 ? `${item.delta_main > 0 ? '+' : ''}${item.delta_main} pts · ` : ''}
              {item.delta_shield !== 0
                ? `${item.delta_shield > 0 ? '+' : ''}${item.delta_shield} shield · `
                : ''}
              {item.source}
            </Text>
            <Text className="text-xs text-subtle">
              {format(new Date(item.created_at), 'MMM d, yyyy · h:mm a')}
            </Text>
          </View>
        )}
      />
    </Screen>
  );
}