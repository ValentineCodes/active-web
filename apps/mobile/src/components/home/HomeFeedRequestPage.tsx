import { Image as RNImage, Pressable, Text, View } from 'react-native';
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
const DARK_SURFACE = '#111111';
const DARK_GLOW_GREEN = '#4ADE80';
const LIGHT_GLOW_GREEN = '#1FA35A';

const DARK_GRID_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="1" cy="1" r="0.75" fill="rgba(255,255,255,0.55)"/></svg>`,
  );

const LIGHT_GRID_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="1" cy="1" r="0.75" fill="rgba(17,24,18,0.35)"/></svg>`,
  );

function glowColor(hex: string, alpha: number) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

/**
 * Soft sunlight wash from the top-right.
 * Uses expo-linear-gradient — already in the native binary (no react-native-svg rebuild).
 */
function TextRequestGlow({ dark }: { dark: boolean }) {
  const color = dark ? DARK_GLOW_GREEN : LIGHT_GLOW_GREEN;
  const peak = dark ? 0.16 : 0.2;
  const fill = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };

  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={[glowColor(color, peak), glowColor(color, peak * 0.3), glowColor(color, 0)]}
        locations={[0, 0.35, 1]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.35, y: 0.55 }}
        style={fill}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[glowColor(color, peak * 0.65), glowColor(color, 0)]}
        locations={[0, 1]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.55, y: 0.4 }}
        style={fill}
      />
    </>
  );
}

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
  const { colors: themeColors, resolved } = useTheme();
  const attachment = useRequestAttachmentUrl(request.attachment_path);
  const imageUri = attachment.data ?? null;
  const hasAttachmentPath = Boolean(request.attachment_path);
  const hasPhoto = Boolean(imageUri);
  const photoLoading = hasAttachmentPath && !hasPhoto && attachment.isPending;
  const showAtmosphere = !hasPhoto && !photoLoading;
  const darkAtmosphere = showAtmosphere && resolved === 'dark';
  const lightCopy = hasPhoto || darkAtmosphere;

  const title = request.title ?? 'Request';
  const description = requestOutcomeDescription(request.description);
  const postedLabel = request.posted_at ? formatAgo(request.posted_at) : null;

  const titleClass = lightCopy
    ? 'text-3xl font-bold leading-9 text-white'
    : 'text-3xl font-bold leading-9 text-ink';
  const bodyClass = lightCopy
    ? 'text-base leading-6 text-white/90'
    : 'text-base leading-6 text-muted';
  const requesterNameClass = lightCopy
    ? 'text-lg font-semibold leading-6 text-white'
    : 'text-lg font-semibold leading-6 text-ink';
  const metaSubClass = lightCopy ? 'text-xs text-white/80' : 'text-xs text-muted';
  const whenChipClass = lightCopy
    ? 'rounded-full bg-white/15 px-3 py-1'
    : 'rounded-full bg-surface px-3 py-1';
  const whenTextClass = lightCopy
    ? 'text-sm font-semibold text-white'
    : 'text-sm font-semibold text-ink';
  const footerBorderClass = lightCopy ? 'border-t border-white/15' : 'border-t border-hairline';
  const locationIconColor = lightCopy ? '#ffffff' : colors.ink;
  const locationTextClass = lightCopy
    ? 'text-sm font-medium text-white'
    : 'text-sm font-medium text-ink';

  const openDisabled = !isOwnRequest && waiting;

  return (
    <View style={{ height: pageHeight, width: '100%' }} className="bg-canvas">
      <View
        className="flex-1 overflow-hidden"
        style={{
          backgroundColor: showAtmosphere
            ? darkAtmosphere
              ? DARK_SURFACE
              : themeColors.canvas
            : themeColors.canvas,
        }}
      >
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
        ) : photoLoading ? (
          <SkeletonBlock className="absolute inset-0 rounded-none" />
        ) : (
          <>
            <View
              pointerEvents="none"
              className="absolute inset-0"
              style={{
                backgroundColor: darkAtmosphere ? DARK_SURFACE : themeColors.canvas,
              }}
            />

            <TextRequestGlow dark={darkAtmosphere} />

            <RNImage
              pointerEvents="none"
              source={{ uri: darkAtmosphere ? DARK_GRID_URI : LIGHT_GRID_URI }}
              resizeMode="repeat"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                opacity: darkAtmosphere ? 0.4 : 0.3,
              }}
            />

            <View
              pointerEvents="none"
              className="absolute left-5 flex-row items-center gap-2"
              style={{ top: '29%' }}
            >
              <View
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: darkAtmosphere ? DARK_GLOW_GREEN : LIGHT_GLOW_GREEN }}
              />
              <Text
                className="font-bold uppercase"
                style={{
                  fontSize: 12,
                  letterSpacing: 2,
                  color: darkAtmosphere ? 'rgba(255,255,255,0.35)' : 'rgba(17,24,18,0.4)',
                }}
              >
                Open request
              </Text>
            </View>
          </>
        )}

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
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: tabBarInset,
            left: 0,
            zIndex: 1,
          }}
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

          <View
            className={`mt-1 flex-row items-center justify-between gap-3 pt-3 ${footerBorderClass}`}
          >
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

export function proximityLabelForRequest(request: PublicRequest, isOwnRequest: boolean): string {
  if (isOwnRequest) return 'Your request';
  if (request.distance_m != null) return formatProximityHome(request.distance_m);
  return formatCoarseLocationLabel(request.location_label ?? 'Nearby');
}
