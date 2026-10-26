import { useState } from 'react';

import { CatalogueViewer } from '@/components/CatalogueViewer';
import { Avatar } from '@/components/ui/Avatar';

export function AvatarWithViewer({
  path,
  name,
  size = 'md',
  showActiveDot = false,
}: {
  path: string | null | undefined;
  name: string | null;
  size?: 'sm' | 'md' | 'lg';
  showActiveDot?: boolean;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);

  return (
    <>
      <Avatar
        path={path}
        name={name}
        size={size}
        showActiveDot={showActiveDot}
        onPress={path ? () => setViewerOpen(true) : undefined}
      />
      {viewerOpen && path ? (
        <CatalogueViewer
          items={[{ path, kind: 'photo', storage: 'avatar' }]}
          initialIndex={0}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </>
  );
}
