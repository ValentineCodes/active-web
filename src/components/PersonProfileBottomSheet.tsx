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

import { ProfileCataloguePreview } from '@/components/ProfileCataloguePreview';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { StarRating } from '@/components/ui/Stars';
import { colors } from '@/theme';

function ProfileCompletionBadge({ percent }: { percent: number }) {
  return (
    <View className="items-center justify-center rounded-2xl bg-active-soft px-4 py-2.5">
      <Text className="text-2xl font-bold leading-none text-active">{percent}%</Text>
      <Text className="mt-1.5 text-xs font-bold uppercase tracking-widest text-subtle">
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
        {!responderAvailable ? (
          <Text className="text-center text-sm text-muted">
            This person is currently attending to another request.
          </Text>
        ) : null}
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
  responseActions?: PersonProfileResponseActions;
}) {
  const insets = useSafeAreaInsets();
  const [footerKey, setFooterKey] = useState(0);

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
            <Avatar path={avatarPath} name={displayName} size="md" />
            <View className="min-w-0 flex-1 gap-1.5">
              <Text className="text-lg font-bold text-ink">{title}</Text>
              <View className="flex-row flex-wrap items-center gap-1.5">
                <StarRating average={ratingAverage} count={ratingCount ?? 0} />
                {completionPercent != null ? (
                  <>
                    <Text className="text-sm text-subtle">·</Text>
                    <Text className="text-sm text-muted">{completionPercent}% completion</Text>
                  </>
                ) : null}
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
    </BottomSheetModal>
  );
}
