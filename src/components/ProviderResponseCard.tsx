import { useState } from 'react';
import { Text, View } from 'react-native';

import { CatalogueStrip } from '@/components/CatalogueStrip';
import { ProviderProfileModal } from '@/components/ProviderProfileModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PersonRow } from '@/components/ui/PersonRow';
import { TextField } from '@/components/ui/TextField';
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
  phoneVerified,
  distanceM,
  message,
  quotedAmount,
  etaMinutes,
  currency,
  createdAt,
  expiresAt,
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
  phoneVerified: boolean;
  distanceM: number;
  message: string | null;
  quotedAmount: number | null;
  etaMinutes: number | null;
  currency: string;
  createdAt: string;
  expiresAt: string | null;
  onAccept: () => void;
  onDecline: (reason: string | null) => void;
  acceptLoading: boolean;
  declineLoading: boolean;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const distanceLabel = formatDistance(distanceM);
  const reasonError = reason.trim().length > 500 ? 'Keep this to 500 characters.' : null;

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

      {phoneVerified ? <Badge label="Phone verified" tone="info" dot={false} /> : null}

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
        {expiresAt ? (
          <Text className="text-sm text-subtle">Valid while the request is open</Text>
        ) : null}
      </View>

      {declining ? (
        <View className="gap-3">
          <TextField
            label="Reason (optional)"
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. The time doesn't work."
            multiline
            numberOfLines={3}
            maxLength={500}
            counterMax={500}
            error={reasonError}
          />
          <View className="flex-row gap-3">
            <Button
              label="Keep them"
              variant="secondary"
              className="flex-1"
              onPress={() => {
                setDeclining(false);
                setReason('');
              }}
            />
            <Button
              label="Decline"
              variant="danger"
              className="flex-1"
              loading={declineLoading}
              disabled={Boolean(reasonError)}
              onPress={() => onDecline(reason.trim() || null)}
            />
          </View>
        </View>
      ) : (
        <View className="flex-row gap-3">
          <Button
            label="Not this one"
            variant="secondary"
            className="flex-1"
            loading={declineLoading}
            onPress={() => setDeclining(true)}
          />
          <Button
            label="Select"
            variant="active"
            className="flex-1"
            loading={acceptLoading}
            onPress={onAccept}
          />
        </View>
      )}

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
