'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { Avatar } from '@/components/ui/Avatar';
import { IonIcon } from '@/components/ui/IonIcon';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { ionIcons } from '@/components/ui/ion-icons';
import { seedBrowseRequestFromFeed, type PublicRequest } from '@/features/requests/browse-api';
import { useRequestAttachmentUrl } from '@/features/requests/request-attachment-url';
import { requestOutcomeDescription } from '@/features/requests/outcome';
import type { Position } from '@/lib/geolocation';
import {
  formatAgo,
  formatMoney,
  formatWhenHome,
} from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';

const PHOTO_BOTTOM_SCRIM =
  'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.82) 100%)';
const LIGHT_GRID_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="1" cy="1" r="0.75" fill="rgba(17,24,18,0.35)"/></svg>`,
  );
const DARK_GRID_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="1" cy="1" r="0.75" fill="rgba(255,255,255,0.55)"/></svg>`,
  );
const DARK_SURFACE = '#111111';
const LIGHT_GLOW_GREEN = '#1FA35A';
const DARK_GLOW_GREEN = '#4ADE80';

type Props = {
  request: PublicRequest;
  pageHeight: number;
  proximityLabel: string;
  isOwnRequest: boolean;
  waiting: boolean;
  browsePosition: Position | null;
  onRequesterPress: () => void;
};

function requestHref(requestId: string, position: Position | null, isOwnRequest: boolean): string {
  const params = new URLSearchParams();
  if (position) {
    params.set('lat', String(position.latitude));
    params.set('lng', String(position.longitude));
  }
  if (isOwnRequest) params.set('mine', '1');
  const query = params.toString();
  return query ? `/request/${requestId}?${query}` : `/request/${requestId}`;
}

export function HomeFeedRequestPage({
  request,
  pageHeight,
  proximityLabel,
  isOwnRequest,
  waiting,
  browsePosition,
  onRequesterPress,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { resolved, colors } = useTheme();
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
  const bodyClass = lightCopy ? 'text-base leading-6 text-white/90' : 'text-base leading-6 text-muted';
  const requesterNameClass = lightCopy
    ? 'text-sm font-semibold leading-5 text-white'
    : 'text-sm font-semibold leading-5 text-ink';
  const metaSubClass = lightCopy ? 'text-xs font-normal leading-3 text-white/70' : 'text-xs font-normal leading-3 text-subtle';
  const whenChipClass = lightCopy ? 'rounded-full bg-white/15 px-3 py-1' : 'rounded-full bg-surface px-3 py-1';
  const whenTextClass = lightCopy ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-ink';
  const footerBorderClass = lightCopy ? 'border-t border-white/15' : 'border-t border-hairline';
  const locationIconColor = lightCopy ? '#ffffff' : colors.ink;
  const locationTextClass = lightCopy ? 'text-sm font-medium text-white' : 'text-sm font-medium text-ink';

  const openDisabled = !isOwnRequest && waiting;

  const openRequest = () => {
    if (openDisabled) return;
    seedBrowseRequestFromFeed(queryClient, request, browsePosition);
    router.push(requestHref(request.request_id, browsePosition, isOwnRequest));
  };

  const cardDetails = (
    <RequestDetails
      request={request}
      title={title}
      description={description}
      proximityLabel={proximityLabel}
      isOwnRequest={isOwnRequest}
      waiting={waiting}
      titleClass={titleClass}
      bodyClass={bodyClass}
      whenChipClass={whenChipClass}
      whenTextClass={whenTextClass}
      footerBorderClass={footerBorderClass}
      locationIconColor={locationIconColor}
      locationTextClass={locationTextClass}
    />
  );

  if (showAtmosphere) {
    const surfaceTone = darkAtmosphere ? DARK_SURFACE : colors.canvas;

    return (
      <article
        style={{ height: pageHeight }}
        className="relative w-full shrink-0 snap-start snap-always overflow-hidden bg-canvas"
      >
        <div
          className="relative h-full min-h-0 overflow-hidden"
          style={{ backgroundColor: surfaceTone }}
        >
          <TextRequestGlow dark={darkAtmosphere} />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `url(${darkAtmosphere ? DARK_GRID_URI : LIGHT_GRID_URI})`,
              backgroundRepeat: 'repeat',
              opacity: darkAtmosphere ? 0.4 : 0.3,
            }}
            aria-hidden
          />

          <div
            className="pointer-events-none absolute left-5 z-[2] flex flex-row items-center gap-2"
            style={{ top: '29%' }}
          >
            <OpenRequestLabel dark={darkAtmosphere} />
          </div>

          <button
            type="button"
            aria-label={openDisabled ? 'Response pending' : `View request: ${title}`}
            disabled={openDisabled}
            onClick={openRequest}
            className="absolute inset-0 z-[1] disabled:cursor-not-allowed active:opacity-95"
          />

          <button
            type="button"
            aria-label={`View ${request.requester_display_name ?? 'requester'} profile`}
            onClick={(event) => {
              event.stopPropagation();
              onRequesterPress();
            }}
            className="absolute left-0 right-12 top-0 z-[3] flex flex-row items-center gap-2.5 p-4 text-left active:opacity-90"
          >
            <Avatar size="sm" path={request.requester_avatar_path} name={request.requester_display_name} />
            <RequesterBlock
              requesterNameClass={requesterNameClass}
              name={request.requester_display_name ?? 'Someone nearby'}
              postedLabel={postedLabel}
              metaSubClass={metaSubClass}
            />
          </button>

          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[2] flex flex-col gap-3 px-4 pb-4 pt-6">
            {cardDetails}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      style={{ height: pageHeight }}
      className="relative w-full shrink-0 snap-start snap-always overflow-hidden bg-canvas"
    >
      <div className="relative h-full min-h-0 overflow-hidden bg-canvas">
        {hasPhoto ? (
          <img src={imageUri!} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : photoLoading ? (
          <SkeletonBlock className="absolute inset-0 rounded-none" />
        ) : null}

        {hasPhoto ? (
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-1/2"
            style={{ background: PHOTO_BOTTOM_SCRIM }}
          />
        ) : null}

        <button
          type="button"
          aria-label={openDisabled ? 'Response pending' : `View request: ${title}`}
          disabled={openDisabled}
          onClick={openRequest}
          className="absolute inset-0 z-[1] disabled:cursor-not-allowed active:opacity-95"
        />

        <button
          type="button"
          aria-label={`View ${request.requester_display_name ?? 'requester'} profile`}
          onClick={(event) => {
            event.stopPropagation();
            onRequesterPress();
          }}
          className="absolute left-0 right-12 top-0 z-[3] flex flex-row items-center gap-2.5 p-4 text-left active:opacity-90"
        >
          <Avatar size="sm" path={request.requester_avatar_path} name={request.requester_display_name} />
          <RequesterBlock
            requesterNameClass={requesterNameClass}
            name={request.requester_display_name ?? 'Someone nearby'}
            postedLabel={postedLabel}
            metaSubClass={metaSubClass}
          />
        </button>

        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[2] flex flex-col gap-3 px-4 pb-4 pt-6">
          {cardDetails}
        </div>
      </div>
    </article>
  );
}

function RequestDetails({
  request,
  title,
  description,
  proximityLabel,
  isOwnRequest,
  waiting,
  titleClass,
  bodyClass,
  whenChipClass,
  whenTextClass,
  footerBorderClass,
  locationIconColor,
  locationTextClass,
}: {
  request: PublicRequest;
  title: string;
  description: string | null;
  proximityLabel: string;
  isOwnRequest: boolean;
  waiting: boolean;
  titleClass: string;
  bodyClass: string;
  whenChipClass: string;
  whenTextClass: string;
  footerBorderClass: string;
  locationIconColor: string;
  locationTextClass: string;
}) {
  return (
  <>
    <div className="flex flex-row flex-wrap items-center gap-2">
      <span className="rounded-full bg-active px-3 py-1 text-sm font-bold text-on-brand">
        {formatMoney(request.offered_amount!, request.currency!)}
      </span>
      <span className={whenChipClass}>
        <span className={whenTextClass}>{formatWhenHome(request.scheduled_for)}</span>
      </span>
    </div>

    <h2 className={`line-clamp-3 ${titleClass}`}>{title}</h2>
    {description ? <p className={`line-clamp-3 ${bodyClass}`}>{description}</p> : null}

    <div className={`mt-1 flex flex-row items-center justify-between gap-3 pt-3 ${footerBorderClass}`}>
      <span className="inline-flex items-center gap-1.5">
        <IonIcon icon={ionIcons['location-outline']} size={16} color={locationIconColor} />
        <span className={locationTextClass}>{proximityLabel}</span>
      </span>
      <span className="inline-flex items-center gap-0.5">
        {waiting && !isOwnRequest ? (
          <span className="text-xs font-semibold text-active">Pending</span>
        ) : (
          <>
            <span className="text-sm font-semibold text-active">View request</span>
            <IonIcon icon={ionIcons['chevron-forward']} size={16} color="#1FA35A" />
          </>
        )}
      </span>
    </div>
  </>
  );
}

function glowColor(hex: string, alpha: number) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

function TextRequestGlow({ dark }: { dark: boolean }) {
  const color = dark ? DARK_GLOW_GREEN : LIGHT_GLOW_GREEN;
  const peak = dark ? 0.16 : 0.2;
  return (
    <>
      {/* Match native end points ~(35%, 55%) — fade out early so glow stays top-right. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(
            218deg,
            ${glowColor(color, peak)} 0%,
            ${glowColor(color, peak * 0.3)} 22%,
            ${glowColor(color, 0)} 44%
          )`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(
            228deg,
            ${glowColor(color, peak * 0.65)} 0%,
            ${glowColor(color, 0)} 36%
          )`,
        }}
        aria-hidden
      />
    </>
  );
}

function OpenRequestLabel({ dark }: { dark: boolean }) {
  return (
    <div className="pointer-events-none flex flex-row items-center gap-2">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: dark ? DARK_GLOW_GREEN : LIGHT_GLOW_GREEN }}
      />
      <span
        className="font-bold uppercase"
        style={{
          fontSize: 12,
          letterSpacing: 2,
          color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(17,24,18,0.4)',
        }}
      >
        Open request
      </span>
    </div>
  );
}

function RequesterBlock({
  requesterNameClass,
  name,
  postedLabel,
  metaSubClass,
}: {
  requesterNameClass: string;
  name: string;
  postedLabel: string | null;
  metaSubClass: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className={`truncate ${requesterNameClass}`}>{name}</p>
      {postedLabel ? <p className={metaSubClass}>{postedLabel}</p> : null}
    </div>
  );
}

export function HomeFeedRequestPageSkeleton({ pageHeight }: { pageHeight: number }) {
  return (
    <div style={{ height: pageHeight }} className="w-full shrink-0 snap-start bg-canvas">
      <SkeletonBlock className="h-full w-full rounded-none" />
    </div>
  );
}
