import { useAvatarUrl } from '@/features/profile/avatar-url';
import { cn } from '@/lib/cn';

const SIZES = { sm: 40, md: 56, lg: 96 } as const;
const TEXT_SIZES = { sm: 'text-base', md: 'text-xl', lg: 'text-3xl' } as const;
const DOT_SIZES = { sm: 10, md: 14, lg: 20 } as const;

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function Avatar({
  path,
  name,
  size = 'md',
  showActiveDot = false,
}: {
  path: string | null | undefined;
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  showActiveDot?: boolean;
}) {
  const avatarUrl = useAvatarUrl(path);
  const dimension = SIZES[size];
  const pictureLabel = name ? `${name}'s profile picture` : 'Profile picture';

  return (
    <span className="relative inline-flex">
      <span
        className="flex items-center justify-center overflow-hidden rounded-full bg-surface"
        style={{ width: dimension, height: dimension }}
        aria-label={pictureLabel}
      >
        {path && avatarUrl.data ? (
          <img
            src={avatarUrl.data}
            alt=""
            className="h-full w-full object-cover"
            width={dimension}
            height={dimension}
          />
        ) : (
          <span className={cn('font-semibold text-muted', TEXT_SIZES[size])}>{initials(name)}</span>
        )}
      </span>
      {showActiveDot ? (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-canvas bg-active"
          style={{ width: DOT_SIZES[size], height: DOT_SIZES[size] }}
          aria-hidden
        />
      ) : null}
    </span>
  );
}
