import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CatalogueStrip } from '@/components/CatalogueStrip';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { StarRating } from '@/components/ui/Stars';

export function ProviderProfileModal({
  visible,
  onClose,
  providerId,
  displayName,
  avatarPath,
  bio,
  ratingAverage,
  ratingCount,
  jobsCompleted,
  distanceLabel,
}: {
  visible: boolean;
  onClose: () => void;
  providerId: string;
  displayName: string | null;
  avatarPath: string | null;
  bio?: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  jobsCompleted?: number;
  distanceLabel?: string;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <Screen edges={['top', 'bottom']}>
          <Header title={displayName ?? 'Provider'} onClose={onClose} />
          <ScrollView contentContainerClassName="gap-6 p-5 pb-12">
            <View className="items-center gap-3">
              <Avatar path={avatarPath} name={displayName} size="lg" />
              <Text className="text-center text-2xl font-bold text-ink">
                {displayName ?? 'Provider'}
              </Text>
              {bio ? <Text className="text-center text-base text-muted">{bio}</Text> : null}
              <StarRating average={ratingAverage} count={ratingCount ?? 0} />
              {distanceLabel ? <Text className="text-sm text-muted">{distanceLabel}</Text> : null}
            </View>

            {jobsCompleted !== undefined ? (
              <Card className="items-start gap-1">
                <Text className="text-2xl font-bold text-ink">{jobsCompleted}</Text>
                <Text className="text-sm text-muted">
                  {jobsCompleted === 1 ? 'Job delivered' : 'Jobs delivered'}
                </Text>
              </Card>
            ) : null}

            <View className="gap-2">
              <Text className="text-lg font-bold text-ink">Service catalogue</Text>
              <CatalogueStrip userId={providerId} emptyLabel="No work samples yet." />
            </View>
          </ScrollView>
        </Screen>
      </SafeAreaProvider>
    </Modal>
  );
}
