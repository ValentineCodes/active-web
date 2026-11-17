'use client';

import { useEffect, useState } from 'react';
import { Drawer } from 'vaul';

import { ResponderScheduleAvailability } from '@/components/ResponderScheduleAvailability';
import { ProfileCataloguePreview } from '@/components/profile/ProfileCataloguePreview';
import { ProfileCompletionBadge } from '@/components/profile/ProfileCompletionBadge';
import { VaulSheet } from '@/components/ui/VaulSheet';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { StarRating } from '@/components/ui/Stars';
import { TextAreaField } from '@/components/ui/TextField';
import { cn } from '@/lib/cn';

export type ResponderProfileSheetActions = {
  responderAvailable: boolean;
  acceptLoading: boolean;
  declineLoading: boolean;
  onAccept: () => void;
  onDecline: (reason: string | null) => void;
};

export function ResponderProfileSheet({
  open,
  onClose,
  userId,
  displayName,
  avatarPath,
  bio,
  ratingAverage,
  ratingCount,
  completionPercent,
  responseActions,
}: {
  open: boolean;
  onClose: () => void;
  userId?: string | null;
  displayName: string | null;
  avatarPath: string | null;
  bio?: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  completionPercent?: number | null;
  responseActions?: ResponderProfileSheetActions;
}) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const reasonError = reason.trim().length > 500 ? 'Keep this to 500 characters.' : null;
  const title = displayName?.trim() || 'Profile';
  const hasRatings = (ratingCount ?? 0) > 0 && ratingAverage != null;

  useEffect(() => {
    if (!open) {
      setDeclining(false);
      setReason('');
    }
  }, [open]);

  const footer =
    responseActions && !declining ? (
      <div className="flex flex-col gap-3">
        <div className="flex flex-row gap-3">
          <Button
            label="Not this one"
            variant="secondary"
            className="flex-1"
            size="lg"
            loading={responseActions.declineLoading}
            onClick={() => setDeclining(true)}
          />
          <Button
            label="Accept"
            className="flex-1"
            size="lg"
            loading={responseActions.acceptLoading}
            disabled={!responseActions.responderAvailable}
            onClick={responseActions.onAccept}
          />
        </div>
        <ResponderScheduleAvailability available={responseActions.responderAvailable} />
      </div>
    ) : responseActions && declining ? (
      <div className="flex flex-col gap-3">
        <TextAreaField
          label="Reason (optional)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. The time doesn't work."
          maxLength={500}
          error={reasonError ?? undefined}
        />
        <div className="flex flex-row gap-3">
          <Button
            label="Keep them"
            variant="secondary"
            className="flex-1"
            onClick={() => {
              setDeclining(false);
              setReason('');
            }}
          />
          <Button
            label="Decline"
            variant="danger"
            className="flex-1"
            loading={responseActions.declineLoading}
            disabled={Boolean(reasonError)}
            onClick={() => responseActions.onDecline(reason.trim() || null)}
          />
        </div>
      </div>
    ) : undefined;

  return (
    <VaulSheet open={open} onClose={onClose} footer={footer} dismissible={!responseActions?.acceptLoading && !responseActions?.declineLoading}>
      <div className="flex flex-col gap-5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Drawer.Title className="sr-only">{title}</Drawer.Title>
        <div className="flex flex-row items-center gap-3">
          <div
            className={cn(
              'flex min-w-0 flex-1 flex-row gap-3',
              hasRatings ? 'items-start' : 'items-center',
            )}
          >
            <Avatar path={avatarPath} name={displayName} size="md" />
            <div className={cn('min-w-0 flex-1', hasRatings ? 'flex flex-col gap-2' : undefined)}>
              <p className="truncate text-lg font-bold leading-7 text-ink">{title}</p>
              {hasRatings && ratingAverage !== null ? (
                <StarRating average={ratingAverage} count={ratingCount ?? 0} size="md" />
              ) : null}
            </div>
          </div>
          {completionPercent != null ? <ProfileCompletionBadge percent={completionPercent} /> : null}
        </div>
        {bio ? <p className="text-base leading-6 text-muted">{bio}</p> : null}
        {userId ? <ProfileCataloguePreview userId={userId} /> : null}
      </div>
    </VaulSheet>
  );
}