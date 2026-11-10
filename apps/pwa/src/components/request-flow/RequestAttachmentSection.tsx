'use client';

import { useRequestAttachmentUrl } from '@/features/requests/request-attachment-url';

export function RequestAttachmentSection({
  attachmentPath,
}: {
  attachmentPath: string | null | undefined;
}) {
  const signedUrl = useRequestAttachmentUrl(attachmentPath);

  if (!attachmentPath) return null;

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface">
      {signedUrl.isPending ? (
        <div className="flex h-full w-full items-center justify-center">
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-subtle border-t-transparent"
            aria-hidden
          />
        </div>
      ) : signedUrl.data ? (
        <img
          src={signedUrl.data}
          alt="Request photo"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
          Could not load this photo.
        </p>
      )}
    </div>
  );
}
