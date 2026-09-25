import { useState } from 'react';
import { Text, View } from 'react-native';

import { CatalogueStrip } from '@/components/CatalogueStrip';
import { ProviderProfileModal } from '@/components/ProviderProfileModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PersonRow } from '@/components/ui/PersonRow';
import { formatAgo, formatDistance, formatMoney } from '@/lib/format';

/**
 * A provider's answer to a request, as the requester sees it before they've accepted
 * anyone: enough to trust the person and judge the offer, nothing that reveals exactly
 * where they are.
 */
export function ProviderResponseCard({
  providerId,
  displayName,
  avatarPath,
  bio,
  ratingAverage,
  ratingCount,
  jobsCompleted,
  distanceM,
  message,
  quotedAmount,
  etaMinutes,
  currency,
  createdAt,
  onAccept,
  onDecline,
  acceptLoading,
  declineLoading,
}: {
  providerId: string;
  displayName: string | null;
  avatarPath: string | null;
  bio: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  jobsCompleted: number;
  distanceM: number;
  message: string | null;
  quotedAmount: number | null;
  etaMinutes: number | null;
  currency: string;
  createdAt: string;
  onAccept: () => void;
  onDecline: () => void;
  acceptLoading: boolean;
  declineLoading: boolean;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const distanceLabel = formatDistance(distanceM);

  return (
    <Card>
      <PersonRow
        avatarPath={avatarPath}
        name={displayName}
        ratingAverage={ratingAverage}
        ratingCount={ratingCount}
        meta={`${jobsCompleted} ${jobsCompleted === 1 ? 'job' : 'jobs'} delivered · ${distanceLabel}`}
        onPress={() => setProfileOpen(true)}
      />

      {bio ? <Text className="text-sm text-muted">{bio}</Text> : null}

      <CatalogueStrip userId={providerId} />

      {message ? (
        <View className="rounded-2xl bg-surface p-3">
          <Text className="text-base text-ink">{message}</Text>
        </View>
      ) : null}

      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
        {quotedAmount !== null ? (
          <Text className="text-base font-bold text-ink">
            {formatMoney(quotedAmount, currency)}
          </Text>
        ) : null}
        {etaMinutes !== null ? (
          <Text className="text-sm text-muted">Can be there in {etaMinutes} min</Text>
        ) : null}
        <Text className="text-sm text-subtle">{formatAgo(createdAt)}</Text>
      </View>

      <View className="flex-row gap-3">
        <Button
          label="Not this one"
          variant="secondary"
          className="flex-1"
          loading={declineLoading}
          onPress={onDecline}
        />
        <Button
          label="Accept"
          variant="active"
          className="flex-1"
          loading={acceptLoading}
          onPress={onAccept}
        />
      </View>

      <ProviderProfileModal
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
        providerId={providerId}
        displayName={displayName}
        avatarPath={avatarPath}
        bio={bio}
        ratingAverage={ratingAverage}
        ratingCount={ratingCount}
        jobsCompleted={jobsCompleted}
        distanceLabel={distanceLabel}
      />
    </Card>
  );
}
