import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui/Avatar';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import type { PublicRequest } from '@/features/requests/browse-api';
import { useRequestAttachmentUrl } from '@/features/requests/request-attachment-url';
import { requestOutcomeDescription } from '@/features/requests/outcome';
import {
  formatAgo,
  formatCoarseLocationLabel,
  formatMoney,
  formatProximityHome,
  formatWhenHome,
} from '@/lib/format';
import { useColors, useTheme } from '@/theme';

type HomeFeedRequestPageProps = {
  request: PublicRequest;
  pageHeight: number;
  tabBarInset: number;
  proximityLabel: string;
  isOwnRequest: boolean;
  waiting: boolean;
  onOpen: () => void;
  onRequesterPress: () => void;
};

const PHOTO_BOTTOM_SCRIM = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.82)'] as const;

export function HomeFeedRequestPage({
  request,
  pageHeight,
  tabBarInset,
  proximityLabel,
  isOwnRequest,
  waiting,
  onOpen,
  onRequesterPress,
}: HomeFeedRequestPageProps) {
  const colors = useColors();
  const { colors: themeColors } = useTheme();
  const attachment = useRequestAttachmentUrl(request.attachment_path);
  const imageUri = attachment.data ?? null;
  const hasPhoto = Boolean(imageUri);

  const title = request.title ?? 'Request';
  const description = requestOutcomeDescription(request.description);
  const postedLabel = request.posted_at ? formatAgo(request.posted_at) : null;

  const titleClass = hasPhoto ? 'text-3xl font-bold leading-9 text-white' : 'text-3xl font-bold leading-9 text-ink';
  const bodyClass = hasPhoto ? 'text-base leading-6 text-white/90' : 'text-base leading-6 text-muted';
  const requesterNameClass = hasPhoto
    ? 'text-lg font-semibold leading-6 text-white'
    : 'text-lg font-semibold leading-6 text-ink';
  const metaSubClass = hasPhoto ? 'text-xs text-white/80' : 'text-xs text-muted';
  const whenChipClass = hasPhoto
    ? 'rounded-full bg-white/15 px-3 py-1'
    : 'rounded-full bg-surface px-3 py-1';
  const whenTextClass = hasPhoto ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-ink';
  const footerBorderClass = hasPhoto ? 'border-t border-white/15' : 'border-t border-hairline';
  const locationIconColor = hasPhoto ? '#ffffff' : colors.ink;
  const locationTextClass = hasPhoto ? 'text-sm font-medium text-white' : 'text-sm font-medium text-ink';

  const openDisabled = !isOwnRequest && waiting;

  return (
    <View style={{ height: pageHeight, width: '100%' }} className="bg-canvas">
      <View className="flex-1 overflow-hidden" style={{ backgroundColor: themeColors.canvas }}>
        {hasPhoto ? (
          <Image
            source={{ uri: imageUri! }}
            contentFit="cover"
            transition={200}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              width: '100%',
              height: '100%',
            }}
          />
        ) : null}

        {hasPhoto ? (
          <LinearGradient
            pointerEvents="none"
            colors={[...PHOTO_BOTTOM_SCRIM]}
            locations={[0, 1]}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '48%' }}
          />
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={openDisabled ? 'Response pending' : `View request: ${title}`}
          accessibilityState={{ disabled: openDisabled }}
          disabled={openDisabled}
          onPress={onOpen}
          style={{ position: 'absolute', top: 0, right: 0, bottom: tabBarInset, left: 0, zIndex: 1 }}
          className="active:opacity-95"
        />

        <Pressable
          onPress={onRequesterPress}
          accessibilityRole="button"
          accessibilityLabel={`View ${request.requester_display_name ?? 'requester'} profile`}
          className="absolute left-0 right-16 top-0 flex-row items-center gap-2.5 p-4 active:opacity-90"
          style={{ zIndex: 2 }}
        >
          <Avatar
            size="sm"
            path={request.requester_avatar_path}
            name={request.requester_display_name}
          />
          <View className="min-w-0 flex-1">
            <Text className={requesterNameClass} numberOfLines={1}>
              {request.requester_display_name ?? 'Someone nearby'}
            </Text>
            {postedLabel ? <Text className={metaSubClass}>{postedLabel}</Text> : null}
          </View>
        </Pressable>

        <View
          pointerEvents="none"
          className="absolute left-0 right-0 gap-3 px-4 pt-6"
          style={{ bottom: tabBarInset }}
        >
          <View className="flex-row flex-wrap items-center gap-2">
            <View className="rounded-full bg-active px-3 py-1">
              <Text className="text-sm font-bold text-on-brand">
                {formatMoney(request.offered_amount!, request.currency!)}
              </Text>
            </View>
            <View className={whenChipClass}>
              <Text className={whenTextClass}>{formatWhenHome(request.scheduled_for)}</Text>
            </View>
          </View>

          <Text className={titleClass} numberOfLines={3}>
            {title}
          </Text>

          {description ? (
            <Text className={bodyClass} numberOfLines={3}>
              {description}
            </Text>
          ) : null}

          <View className={`mt-1 flex-row items-center justify-between gap-3 pt-3 ${footerBorderClass}`}>
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="location-outline" size={16} color={locationIconColor} />
              <Text className={locationTextClass}>{proximityLabel}</Text>
            </View>
            <View className="flex-row items-center gap-0.5">
              {waiting && !isOwnRequest ? (
                <Text className="text-sm font-semibold text-active">Pending</Text>
              ) : (
                <>
                  <Text className="text-sm font-semibold text-active">View request</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.active} />
                </>
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export function HomeFeedRequestPageSkeleton({
  pageHeight,
}: {
  pageHeight: number;
  tabBarInset: number;
}) {
  return (
    <View style={{ height: pageHeight, width: '100%' }} className="bg-canvas">
      <SkeletonBlock className="h-full w-full" />
    </View>
  );
}

export function proximityLabelForRequest(
  request: PublicRequest,
  isOwnRequest: boolean,
): string {
  if (isOwnRequest) return 'Your request';
  if (request.distance_m != null) return formatProximityHome(request.distance_m);
  return formatCoarseLocationLabel(request.location_label ?? 'Nearby');
}
