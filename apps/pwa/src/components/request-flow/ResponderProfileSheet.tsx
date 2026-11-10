'use client';

import { useState } from 'react';

import { ResponderScheduleAvailability } from '@/components/ResponderScheduleAvailability';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { StarRating } from '@/components/ui/Stars';
import { TextAreaField } from '@/components/ui/TextField';

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

  const footer =
    responseActions && !declining ? (
      <div className="flex flex-col gap-3">
        <div className="flex flex-row gap-3">
          <Button
            label="Not this one"
            variant="secondary"
            className="flex-1"
            loading={responseActions.declineLoading}
            onClick={() => setDeclining(true)}
          />
          <Button
            label="Accept"
            className="flex-1"
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
    <BottomSheet open={open} title={title} onClose={onClose} footer={footer}>
      <div className="flex flex-col items-center gap-4 px-5 pb-4">
        <Avatar path={avatarPath} name={displayName} size="lg" />
        {hasRatings && ratingAverage !== null ? (
          <StarRating average={ratingAverage} count={ratingCount ?? 0} size="md" />
        ) : null}
        {completionPercent != null ? (
          <p className="text-sm font-semibold text-active">{completionPercent}% completion</p>
        ) : null}
        {bio ? <p className="text-center text-sm leading-5 text-muted">{bio}</p> : null}
      </div>
    </BottomSheet>
  );
}
