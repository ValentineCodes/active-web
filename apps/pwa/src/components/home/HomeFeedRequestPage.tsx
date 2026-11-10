'use client';

import { useRouter } from 'next/navigation';

import { Avatar } from '@/components/ui/Avatar';
import { IonIcon } from '@/components/ui/IonIcon';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { ionIcons } from '@/components/ui/ion-icons';
import { TAB_BAR_HEIGHT } from '@/components/ui/tab-bar-insets';
import type { PublicRequest } from '@/features/requests/browse-api';
import { useRequestAttachmentUrl } from '@/features/requests/request-attachment-url';
import { requestOutcomeDescription } from '@/features/requests/outcome';
import {
  formatAgo,
  formatMoney,
  formatWhenHome,
} from '@/lib/format';

const PHOTO_BOTTOM_SCRIM =
  'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.82) 100%)';
const LIGHT_GRID_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="1" cy="1" r="0.75" fill="rgba(17,24,18,0.35)"/></svg>`,
  );
const LIGHT_GLOW_GREEN = '#1FA35A';

type Props = {
  request: PublicRequest;
  pageHeight: number;
  proximityLabel: string;
  isOwnRequest: boolean;
  waiting: boolean;
};

export function HomeFeedRequestPage({
  request,
  pageHeight,
  proximityLabel,
  isOwnRequest,
  waiting,
}: Props) {
  const router = useRouter();
  const attachment = useRequestAttachmentUrl(request.attachment_path);
  const imageUri = attachment.data ?? null;
  const hasAttachmentPath = Boolean(request.attachment_path);
  const hasPhoto = Boolean(imageUri);
  const photoLoading = hasAttachmentPath && !hasPhoto && attachment.isPending;
  const showAtmosphere = !hasPhoto && !photoLoading;

  const title = request.title ?? 'Request';
  const description = requestOutcomeDescription(request.description);
  const postedLabel = request.posted_at ? formatAgo(request.posted_at) : null;

  const lightCopy = hasPhoto;

  const titleClass = lightCopy ? 'text-2xl font-bold leading-8 text-white' : 'text-2xl font-bold leading-8 text-ink';
  const bodyClass = lightCopy ? 'text-sm leading-5 text-white/90' : 'text-sm leading-5 text-muted';
  const requesterNameClass = lightCopy
    ? 'text-base font-semibold leading-5 text-white'
    : 'text-base font-semibold leading-5 text-ink';
  const metaSubClass = lightCopy ? 'text-xs text-white/80' : 'text-xs text-muted';
  const whenChipClass = lightCopy ? 'rounded-full bg-white/15 px-3 py-1' : 'rounded-full bg-surface px-3 py-1';
  const whenTextClass = lightCopy ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-ink';
  const footerBorderClass = lightCopy ? 'border-t border-white/15' : 'border-t border-hairline';
  const locationIconColor = lightCopy ? '#ffffff' : '#111812';
  const locationTextClass = lightCopy ? 'text-xs font-medium text-white' : 'text-xs font-medium text-ink';

  const openDisabled = !isOwnRequest && waiting;
  const tabBarInset = TAB_BAR_HEIGHT + 8;

  const openRequest = () => {
    if (openDisabled) return;
    if (isOwnRequest) {
      router.push(`/request/${request.request_id}`);
      return;
    }
    router.push(`/respond/${request.request_id}`);
  };

  return (
    <article style={{ height: pageHeight }} className="relative w-full shrink-0 snap-start snap-always bg-canvas">
      <div className="relative h-full overflow-hidden bg-canvas">
        {hasPhoto ? (
          <img src={imageUri!} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : photoLoading ? (
          <SkeletonBlock className="absolute inset-0 rounded-none" />
        ) : showAtmosphere ? (
          <>
            <div className="absolute inset-0 bg-canvas" />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `radial-gradient(ellipse at 90% 0%, rgba(31,163,90,0.2) 0%, rgba(31,163,90,0.06) 35%, transparent 65%)`,
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{ backgroundImage: `url(${LIGHT_GRID_URI})`, backgroundRepeat: 'repeat' }}
              aria-hidden
            />
            <OpenRequestLabel />
          </>
        ) : null}

        {hasPhoto ? (
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-[48%]"
            style={{ background: PHOTO_BOTTOM_SCRIM }}
          />
        ) : null}

        <button
          type="button"
          aria-label={openDisabled ? 'Response pending' : `View request: ${title}`}
          disabled={openDisabled}
          onClick={openRequest}
          style={{ bottom: tabBarInset }}
          className="absolute inset-x-0 top-0 z-[1] disabled:cursor-not-allowed active:opacity-95"
        />

        <button
          type="button"
          aria-label={`View ${request.requester_display_name ?? 'requester'} profile`}
          onClick={() => router.push(`/profile`)}
          className="absolute left-0 right-16 top-0 z-[2] flex flex-row items-center gap-2.5 p-4 text-left active:opacity-90"
        >
          <Avatar size="sm" path={request.requester_avatar_path} name={request.requester_display_name} />
          <RequesterBlock
            requesterNameClass={requesterNameClass}
            name={request.requester_display_name ?? 'Someone nearby'}
            postedLabel={postedLabel}
            metaSubClass={metaSubClass}
          />
        </button>

        <div
          className="pointer-events-none absolute left-0 right-0 flex flex-col gap-3 px-4 pt-6"
          style={{ bottom: tabBarInset }}
        >
          <div className="flex flex-row flex-wrap items-center gap-2">
            <span className="rounded-full bg-active px-3 py-1 text-xs font-bold text-on-brand">
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
                  <span className="text-xs font-semibold text-active">View request</span>
                  <IonIcon icon={ionIcons['chevron-forward']} size={16} color="#1FA35A" />
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function OpenRequestLabel() {
  return (
    <div className="absolute left-5 flex flex-row items-center gap-2" style={{ top: '29%' }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: LIGHT_GLOW_GREEN }} />
      <span
        className="font-bold uppercase"
        style={{ fontSize: 12, letterSpacing: 2, color: 'rgba(17,24,18,0.4)' }}
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
    <FeedPageSkeleton pageHeight={pageHeight} />
  );
}

function FeedPageSkeleton({ pageHeight }: { pageHeight: number }) {
  return (
    <div style={{ height: pageHeight }} className="w-full shrink-0 snap-start bg-canvas">
      <SkeletonBlock className="h-full w-full rounded-none" />
    </div>
  );
}
