import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CatalogueStrip } from '@/components/CatalogueStrip';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { StarRating } from '@/components/ui/Stars';

function completedRequestCount(jobsCompleted?: number, requestsCompleted?: number) {
  const jobs = jobsCompleted ?? 0;
  const requests = requestsCompleted ?? 0;
  if (requestsCompleted !== undefined) return jobs + requests;
  if (jobsCompleted !== undefined) return jobs;
  return undefined;
}

export function PersonProfileModal({
  visible,
  onClose,
  userId,
  displayName,
  avatarPath,
  bio,
  ratingAverage,
  ratingCount,
  jobsCompleted,
  requestsCompleted,
  phoneVerified,
  profilePhotoVerified,
  distanceLabel,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  displayName: string | null;
  avatarPath: string | null;
  bio?: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  jobsCompleted?: number;
  requestsCompleted?: number;
  phoneVerified?: boolean;
  profilePhotoVerified?: boolean;
  distanceLabel?: string;
}) {
  const title = displayName?.trim() || 'Profile';
  const completed = completedRequestCount(jobsCompleted, requestsCompleted);

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
          <Header title={title} onClose={onClose} />
          <ScrollView contentContainerClassName="gap-6 p-5 pb-12">
            <View className="items-center gap-3">
              <Avatar path={avatarPath} name={displayName} size="lg" />
              <Text className="text-center text-2xl font-bold text-ink">{title}</Text>
              {bio ? <Text className="text-center text-base text-muted">{bio}</Text> : null}
              <StarRating average={ratingAverage} count={ratingCount ?? 0} />
              {distanceLabel ? <Text className="text-sm text-muted">{distanceLabel}</Text> : null}
            </View>

            {phoneVerified || profilePhotoVerified ? (
              <View className="flex-row flex-wrap justify-center gap-2">
                {phoneVerified ? <Badge label="Phone verified" tone="info" dot={false} /> : null}
                {profilePhotoVerified ? (
                  <Badge label="Profile photo verified" tone="info" dot={false} />
                ) : null}
              </View>
            ) : null}

            {completed !== undefined && completed > 0 ? (
              <Card className="items-start gap-1">
                <Text className="text-2xl font-bold text-ink">{completed}</Text>
                <Text className="text-sm text-muted">
                  {completed === 1 ? 'Completed request' : 'Completed requests'}
                </Text>
              </Card>
            ) : null}

            <CatalogueStrip userId={userId} />
          </ScrollView>
        </Screen>
      </SafeAreaProvider>
    </Modal>
  );
}
