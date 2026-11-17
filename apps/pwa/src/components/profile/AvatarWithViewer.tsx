'use client';

import { useState } from 'react';

import { MediaViewer } from '@/components/media/MediaViewer';
import { Avatar } from '@/components/ui/Avatar';

export function AvatarWithViewer({
  path,
  name,
  size = 'md',
  showActiveDot = false,
}: {
  path: string | null | undefined;
  name: string | null | undefined;
  size?: 'sm' | 'm' | 'md' | 'lg';
  showActiveDot?: boolean;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);

  if (!path) {
    return <Avatar path={path} name={name} size={size} showActiveDot={showActiveDot} />;
  }

  return (
    <>
      <button
        type="button"
        className="rounded-full active:opacity-90"
        aria-label={name ? `View ${name}'s profile photo` : 'View profile photo'}
        onClick={() => setViewerOpen(true)}
      >
        <Avatar path={path} name={name} size={size} showActiveDot={showActiveDot} />
      </button>
      {viewerOpen ? (
        <MediaViewer
          items={[{ path, kind: 'photo', storage: 'avatar' }]}
          initialIndex={0}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </>
  );
}