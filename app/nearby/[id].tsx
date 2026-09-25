import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateView';
import { useCategoryIndex } from '@/features/categories/api';
import { useBrowseRequest } from '@/features/requests/browse-api';
import { formatDistance, formatMoney, formatWhen } from '@/lib/format';
import { readPositionIfPermitted, requestPosition, type Position } from '@/lib/location';
import { colors } from '@/theme';

export default function PublicRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const categories = useCategoryIndex();
  const [position, setPosition] = useState<Position | null>(null);
  const [checked, setChecked] = useState(false);

  const request = useBrowseRequest(id, position);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      readPositionIfPermitted().then((existing) => {
        if (cancelled) return;
        setPosition(existing);
        setChecked(true);
      });

      return () => {
        cancelled = true;
      };
    }, []),
  );

  const category = request.data ? categories.data?.get(request.data.category_slug) : undefined;

  if (!checked || (position && (request.isPending || categories.isPending))) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Request" onBack={() => router.back()} />
        <LoadingState label="Opening this request" />
      </Screen>
    );
  }

  if (!position) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Request" onBack={() => router.back()} />
        <EmptyState
          icon="location-outline"
          title="Location is needed"
          message="Distance is worked out from where you are. The exact place stays private."
          action={{
            label: 'Use my location',
            onPress: () => {
              requestPosition().then((result) => {
                if (result.ok) setPosition(result.position);
              });
            },
          }}
        />
      </Screen>
    );
  }

  if (request.isError) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Request" onBack={() => router.back()} />
        <ErrorState error={request.error} onRetry={() => request.refetch()} />
      </Screen>
    );
  }

  if (!request.data) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Request" onBack={() => router.back()} />
        <EmptyState
          icon="search-outline"
          title="This request is no longer nearby"
          message="It was taken, cancelled, or it is outside the area it is searching."
          action={{ label: 'Back', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const data = request.data;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={category?.label ?? data.category_slug} onBack={() => router.back()} />

      <ScrollView contentContainerClassName="gap-6 p-5 pb-12">
        <View className="flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft">
            <Ionicons name={category?.icon ?? 'ellipse-outline'} size={22} color={colors.brand} />
          </View>
          <Text className="flex-1 text-xl font-bold text-ink">
            {category?.label ?? data.category_slug}
          </Text>
        </View>

        <Text className="text-base text-ink">{data.description}</Text>

        <Card>
          <Text className="text-sm text-muted">{formatWhen(data.scheduled_for)}</Text>
          <Text className="text-sm text-muted">
            {formatDistance(data.distance_m)} · around {data.location_label}
          </Text>
          <Text className="text-lg font-bold text-ink">
            {data.offered_amount !== null
              ? formatMoney(data.offered_amount, data.currency)
              : 'Open to offers'}
          </Text>
        </Card>

        <View className="flex-row items-start gap-3 rounded-2xl bg-surface p-4">
          <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
          <Text className="flex-1 text-sm text-muted">
            This is the public view. The exact place, contact details, and any responses stay
            private.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
