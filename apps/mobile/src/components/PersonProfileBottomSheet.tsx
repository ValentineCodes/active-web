import { useCallback, useMemo, useState, type RefObject } from 'react';
import { Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CatalogueViewer } from '@/components/CatalogueViewer';
import { ResponderScheduleAvailability } from '@/components/ResponderScheduleAvailability';
import { BottomSheetWindow } from '@/components/ui/BottomSheetWindow';
import { ProfileCataloguePreview } from '@/components/ProfileCataloguePreview';
import { IdentityVerifiedBadge } from '@/components/profile/IdentityVerifiedBadge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { StarRating } from '@/components/ui/Stars';
import { useColors } from '@/theme';

function ProfileCompletionBadge({ percent }: { percent: number }) {
  return (
    <View className="items-center gap-0.5 rounded-2xl bg-active-soft px-4 py-3">
      <Text className="text-2xl font-bold leading-8 text-active">{percent}%</Text>
      <Text className="text-xs font-bold uppercase leading-4 tracking-widest text-subtle">
        Completion
      </Text>
    </View>
  );
}

export type PersonProfileResponseActions = {
  responderAvailable: boolean;
  acceptLoading: boolean;
  declineLoading: boolean;
  onAccept: () => void;
  onDecline: (reason: string | null) => void;
};

function PersonProfileResponseFooter({
  footerProps,
  actions,
  bottomInset,
}: {
  footerProps: BottomSheetFooterProps;
  actions: PersonProfileResponseActions;
  bottomInset: number;
}) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const reasonError = reason.trim().length > 500 ? 'Keep this to 500 characters.' : null;
  const { responderAvailable, acceptLoading, declineLoading, onAccept, onDecline } = actions;
  const canSelect = responderAvailable;

  return (
    <BottomSheetFooter {...footerProps} bottomInset={bottomInset}>
      <View className="gap-3 border-t border-hairline bg-elevated px-5 pt-4">
        {declining ? (
          <>
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
          </>
        ) : (
          <View className="flex-row gap-3">
            <Button
              label="Not this one"
              variant="secondary"
              className="flex-1"
              size="lg"
              loading={declineLoading}
              onPress={() => setDeclining(true)}
            />
            <Button
              label="Accept"
              className="flex-1"
              size="lg"
              loading={acceptLoading}
              disabled={!canSelect}
              onPress={onAccept}
            />
          </View>
        )}
        <View className="items-center">
          <ResponderScheduleAvailability available={responderAvailable} />
        </View>
      </View>
    </BottomSheetFooter>
  );
}

export function PersonProfileBottomSheet({
  sheetRef,
  userId,
  displayName,
  avatarPath,
  bio,
  ratingAverage,
  ratingCount,
  completionPercent,
  identityVerified = false,
  responseActions,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  userId: string;
  displayName: string | null;
  avatarPath: string | null;
  bio?: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  completionPercent?: number | null;
  identityVerified?: boolean;
  responseActions?: PersonProfileResponseActions;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [footerKey, setFooterKey] = useState(0);
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);

  const snapPoints = useMemo(() => ['62%', '94%'], []);
  const title = displayName?.trim() || 'Profile';
  const hasFooter = Boolean(responseActions);
  const scrollBottomPadding = hasFooter ? 120 + insets.bottom : 36;

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.45} />
    ),
    [],
  );

  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => {
      if (!responseActions) return null;

      return (
        <PersonProfileResponseFooter
          key={footerKey}
          footerProps={props}
          actions={responseActions}
          bottomInset={insets.bottom}
        />
      );
    },
    [footerKey, responseActions, insets.bottom],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      containerComponent={BottomSheetWindow}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      footerComponent={hasFooter ? renderFooter : undefined}
      backgroundStyle={{ backgroundColor: colors.elevated }}
      handleIndicatorStyle={{ backgroundColor: colors.hairline, width: 48, height: 4 }}
      onDismiss={() => setFooterKey((key) => key + 1)}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: scrollBottomPadding }}
      >
        <View className="gap-5">
          <View className="flex-row items-center gap-3">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <Avatar
                path={avatarPath}
                name={displayName}
                size="md"
                verified={identityVerified}
                onPress={avatarPath ? () => setAvatarViewerOpen(true) : undefined}
              />
              <View className="min-w-0 flex-1 gap-2">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="text-lg font-bold leading-7 text-ink">{title}</Text>
                  {identityVerified ? <IdentityVerifiedBadge /> : null}
                </View>
                <StarRating average={ratingAverage} count={ratingCount ?? 0} />
              </View>
            </View>
            {completionPercent != null ? (
              <ProfileCompletionBadge percent={completionPercent} />
            ) : null}
          </View>

          {bio ? <Text className="text-base leading-6 text-muted">{bio}</Text> : null}

          <ProfileCataloguePreview userId={userId} />
        </View>
      </BottomSheetScrollView>

      {avatarViewerOpen && avatarPath ? (
        <CatalogueViewer
          items={[{ path: avatarPath, kind: 'photo', storage: 'avatar' }]}
          initialIndex={0}
          onClose={() => setAvatarViewerOpen(false)}
        />
      ) : null}
    </BottomSheetModal>
  );
}
