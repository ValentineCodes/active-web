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
    <div
      className="flex w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface"
      style={{ aspectRatio: '4 / 3' }}
    >
      {signedUrl.isPending ? (
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-subtle border-t-transparent"
          aria-label="Loading request photo"
        />
      ) : signedUrl.data ? (
        <img
          src={signedUrl.data}
          alt="Request photo"
          className="h-full w-full object-cover"
        />
      ) : (
        <p className="px-4 text-center text-sm text-muted">Could not load this photo.</p>
      )}
    </div>
  );
}
