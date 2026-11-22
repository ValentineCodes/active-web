'use client';

/** Centered pill — project group lifecycle (submit, payout), not a chat bubble. */
export function GroupAnnouncementRow({ body }: { body: string }) {
  const text = body.trim();
  if (!text) return null;

  return (
    <div className="flex w-full max-w-full justify-center self-stretch px-2 py-2">
      <p className="max-w-[min(100%,22rem)] rounded-full border border-hairline bg-elevated px-4 py-2 text-center text-xs font-semibold leading-5 text-muted shadow-card">
        {text}
      </p>
    </div>
  );
}