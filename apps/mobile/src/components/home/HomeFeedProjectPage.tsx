import { Image as RNImage, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Avatar } from '@/components/ui/Avatar';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { MARKET } from '@/config';
import type { PublicProject } from '@/features/projects/project-browse-api';
import { useRequestAttachmentUrl } from '@/features/requests/request-attachment-url';
import { requestOutcomeDescription } from '@/features/requests/outcome';
import { formatAgo, formatCoarseLocationLabel, formatMoney } from '@/lib/format';
import { useColors, useTheme } from '@/theme';

type HomeFeedProjectPageProps = {
  project: PublicProject;
  pageHeight: number;
  tabBarInset: number;
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

function locationLabelForProject(project: PublicProject): string {
  if (project.viewer_is_creator) return 'Your project';
  return formatCoarseLocationLabel(project.location_label ?? 'Nearby');
}

function glowColor(hex: string, alpha: number) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

function TextProjectGlow({ dark }: { dark: boolean }) {
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

export function HomeFeedProjectPage({ project, pageHeight, tabBarInset }: HomeFeedProjectPageProps) {
  const colors = useColors();
  const { colors: themeColors, resolved } = useTheme();
  const attachment = useRequestAttachmentUrl(project.attachment_path);
  const imageUri = attachment.data ?? null;
  const hasAttachmentPath = Boolean(project.attachment_path);
  const hasPhoto = Boolean(imageUri);
  const photoLoading = hasAttachmentPath && !hasPhoto && attachment.isPending;
  const showAtmosphere = !hasPhoto && !photoLoading;
  const darkAtmosphere = showAtmosphere && resolved === 'dark';
  const lightCopy = hasPhoto || darkAtmosphere;

  const title = project.title ?? 'Project';
  const description = requestOutcomeDescription(project.description);
  const postedLabel = project.posted_at ? formatAgo(project.posted_at) : null;
  const budgetMajor = project.budget_total_kobo / 100;
  const contributedMajor = project.contributed_total_kobo / 100;
  const locationLabel = locationLabelForProject(project);

  const titleClass = lightCopy
    ? 'text-3xl font-bold leading-9 text-white'
    : 'text-3xl font-bold leading-9 text-ink';
  const bodyClass = lightCopy ? 'text-base leading-6 text-white/90' : 'text-base leading-6 text-muted';
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
  const showContributeCta =
    project.funding_status === 'open' || project.funding_status === 'target_met';
  const footerActionLabel = showContributeCta ? 'Contribute' : 'View project';

  const openProject = () => {
    router.push(`/project/${project.project_id}`);
  };

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
              style={{ backgroundColor: darkAtmosphere ? DARK_SURFACE : themeColors.canvas }}
            />
            <TextProjectGlow dark={darkAtmosphere} />
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
          accessibilityLabel={`View project: ${title}`}
          onPress={openProject}
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

        <View
          className="absolute left-0 right-0 top-0 flex-row items-center gap-2.5 p-4"
          style={{ zIndex: 2 }}
        >
          <Avatar
            size="sm"
            path={project.creator_avatar_path}
            name={project.creator_display_name}
          />
          <View className="min-w-0 flex-1">
            <Text className={requesterNameClass} numberOfLines={1}>
              {project.creator_display_name ?? 'Collaborator'}
            </Text>
            {postedLabel ? <Text className={metaSubClass}>{postedLabel}</Text> : null}
          </View>
        </View>

        <View
          pointerEvents="none"
          className="absolute left-0 right-0 gap-3 px-4 pt-6"
          style={{ bottom: tabBarInset }}
        >
          <View className="flex-row flex-wrap items-center gap-2">
            <View className="rounded-full bg-active px-3 py-1">
              <Text className="text-sm font-bold text-on-brand">
                {formatMoney(budgetMajor, MARKET.currency)}
              </Text>
            </View>
            <View className={whenChipClass}>
              <Text className={whenTextClass}>
                {formatMoney(contributedMajor, MARKET.currency)} raised
              </Text>
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
              <Text className={locationTextClass}>{locationLabel}</Text>
            </View>
            <View className="flex-row items-center gap-0.5">
              <Text className="text-sm font-semibold text-active">{footerActionLabel}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.active} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}