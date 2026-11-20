'use client';

import { useRouter } from '@/lib/navigation';

import { Avatar } from '@/components/ui/Avatar';
import { IonIcon } from '@/components/ui/IonIcon';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { ionIcons } from '@/components/ui/ion-icons';
import type { PublicProject } from '@/features/projects/project-browse-api';
import { useRequestAttachmentUrl } from '@/features/requests/request-attachment-url';
import { requestOutcomeDescription } from '@/features/requests/outcome';
import { MARKET } from '@/config';
import { formatAgo, formatCoarseLocationLabel, formatMoney } from '@/lib/format';
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
  project: PublicProject;
  pageHeight: number;
  tabBarInset: number;
};

function locationLabelForProject(project: PublicProject): string {
  if (project.viewer_is_creator) return 'Your project';
  return formatCoarseLocationLabel(project.location_label ?? 'Nearby');
}

export function HomeFeedProjectPage({ project, pageHeight, tabBarInset }: Props) {
  const router = useRouter();
  const { resolved, colors } = useTheme();
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
  const showContributeCta =
    project.funding_status === 'open' || project.funding_status === 'target_met';
  const footerActionLabel = showContributeCta ? 'Contribute' : 'View project';

  const titleClass = lightCopy
    ? 'text-3xl font-bold leading-9 text-white'
    : 'text-3xl font-bold leading-9 text-ink';
  const bodyClass = lightCopy ? 'text-base leading-6 text-white/90' : 'text-base leading-6 text-muted';
  const requesterNameClass = lightCopy
    ? 'text-sm font-semibold leading-5 text-white'
    : 'text-sm font-semibold leading-5 text-ink';
  const metaSubClass = lightCopy
    ? 'text-xs font-normal leading-3 text-white/70'
    : 'text-xs font-normal leading-3 text-subtle';
  const whenChipClass = lightCopy ? 'rounded-full bg-white/15 px-3 py-1' : 'rounded-full bg-surface px-3 py-1';
  const whenTextClass = lightCopy ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-ink';
  const footerBorderClass = lightCopy ? 'border-t border-white/15' : 'border-t border-hairline';
  const locationIconColor = lightCopy ? '#ffffff' : colors.ink;
  const locationTextClass = lightCopy ? 'text-sm font-medium text-white' : 'text-sm font-medium text-ink';

  const openProject = () => {
    router.push(`/project/${project.project_id}`);
  };

  const cardDetails = (
    <ProjectDetails
      title={title}
      description={description}
      budgetMajor={budgetMajor}
      contributedMajor={contributedMajor}
      locationLabel={locationLabel}
      titleClass={titleClass}
      bodyClass={bodyClass}
      whenChipClass={whenChipClass}
      whenTextClass={whenTextClass}
      footerBorderClass={footerBorderClass}
      locationIconColor={locationIconColor}
      locationTextClass={locationTextClass}
      footerActionLabel={footerActionLabel}
    />
  );

  if (showAtmosphere) {
    const surfaceTone = darkAtmosphere ? DARK_SURFACE : colors.canvas;

    return (
      <article
        style={{ height: pageHeight }}
        className="relative w-full shrink-0 snap-start snap-always overflow-hidden bg-canvas"
      >
        <div className="relative h-full min-h-0 overflow-hidden" style={{ backgroundColor: surfaceTone }}>
          <TextProjectGlow dark={darkAtmosphere} />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `url(${darkAtmosphere ? DARK_GRID_URI : LIGHT_GRID_URI})`,
              backgroundRepeat: 'repeat',
              opacity: darkAtmosphere ? 0.4 : 0.3,
            }}
            aria-hidden
          />
          <button
            type="button"
            aria-label={`View project: ${title}`}
            onClick={openProject}
            style={{ bottom: tabBarInset }}
            className="absolute inset-x-0 top-0 z-[1] active:opacity-95"
          />
          <div className="absolute left-0 right-0 top-0 z-[3] flex flex-row items-center gap-2.5 p-4">
            <Avatar size="sm" path={project.creator_avatar_path} name={project.creator_display_name} />
            <CreatorBlock
              requesterNameClass={requesterNameClass}
              name={project.creator_display_name ?? 'Collaborator'}
              postedLabel={postedLabel}
              metaSubClass={metaSubClass}
            />
          </div>
          <div
            className="pointer-events-none absolute left-0 right-0 z-[2] flex flex-col gap-3 px-4 pb-4 pt-6"
            style={{ bottom: tabBarInset }}
          >
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
          aria-label={`View project: ${title}`}
          onClick={openProject}
          style={{ bottom: tabBarInset }}
          className="absolute inset-x-0 top-0 z-[1] active:opacity-95"
        />

        <div className="absolute left-0 right-0 top-0 z-[3] flex flex-row items-center gap-2.5 p-4">
          <Avatar size="sm" path={project.creator_avatar_path} name={project.creator_display_name} />
          <CreatorBlock
            requesterNameClass={requesterNameClass}
            name={project.creator_display_name ?? 'Collaborator'}
            postedLabel={postedLabel}
            metaSubClass={metaSubClass}
          />
        </div>

        <div
          className="pointer-events-none absolute left-0 right-0 z-[2] flex flex-col gap-3 px-4 pb-4 pt-6"
          style={{ bottom: tabBarInset }}
        >
          {cardDetails}
        </div>
      </div>
    </article>
  );
}

function ProjectDetails({
  title,
  description,
  budgetMajor,
  contributedMajor,
  locationLabel,
  titleClass,
  bodyClass,
  whenChipClass,
  whenTextClass,
  footerBorderClass,
  locationIconColor,
  locationTextClass,
  footerActionLabel,
}: {
  title: string;
  description: string | null;
  budgetMajor: number;
  contributedMajor: number;
  locationLabel: string;
  titleClass: string;
  bodyClass: string;
  whenChipClass: string;
  whenTextClass: string;
  footerBorderClass: string;
  locationIconColor: string;
  locationTextClass: string;
  footerActionLabel: string;
}) {
  return (
    <>
      <div className="flex flex-row flex-wrap items-center gap-2">
        <span className="rounded-full bg-active px-3 py-1 text-sm font-bold text-on-brand">
          {formatMoney(budgetMajor, MARKET.currency)}
        </span>
        <span className={whenChipClass}>
          <span className={whenTextClass}>
            {formatMoney(contributedMajor, MARKET.currency)} raised
          </span>
        </span>
      </div>

      <h2 className={`line-clamp-3 ${titleClass}`}>{title}</h2>
      {description ? <p className={`line-clamp-3 ${bodyClass}`}>{description}</p> : null}

      <div className={`mt-1 flex flex-row items-center justify-between gap-3 pt-3 ${footerBorderClass}`}>
        <span className="inline-flex items-center gap-1.5">
          <IonIcon icon={ionIcons['location-outline']} size={16} color={locationIconColor} />
          <span className={locationTextClass}>{locationLabel}</span>
        </span>
        <span className="inline-flex items-center gap-0.5">
          <span className="text-sm font-semibold text-active">{footerActionLabel}</span>
          <IonIcon icon={ionIcons['chevron-forward']} size={16} color="#1FA35A" />
        </span>
      </div>
    </>
  );
}

function CreatorBlock({
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

function glowColor(hex: string, alpha: number) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

function TextProjectGlow({ dark }: { dark: boolean }) {
  const color = dark ? DARK_GLOW_GREEN : LIGHT_GLOW_GREEN;
  const peak = dark ? 0.16 : 0.2;

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${glowColor(color, peak)} 0%, ${glowColor(color, peak * 0.3)} 35%, ${glowColor(color, 0)} 100%)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(160deg, ${glowColor(color, peak * 0.65)} 0%, ${glowColor(color, 0)} 55%)`,
        }}
      />
    </>
  );
}