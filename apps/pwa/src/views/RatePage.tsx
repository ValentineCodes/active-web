'use client';

import { useState } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { StarPicker } from '@/components/ui/Stars';
import { TextAreaField } from '@/components/ui/TextField';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useEngagement, useRateRequest } from '@/features/requests/requester-api';
import { useRouter } from '@/lib/navigation';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import { useRouteParam } from '@/lib/route-param';
import { useColors } from '@/theme/ThemeProvider';

const PROMPTS = [
  'What went wrong?',
  'What went wrong?',
  'What could have been better?',
  'What went well?',
  'What made it great?',
] as const;

export function RatePage() {
  const router = useRouter();
  const colors = useColors();
  const id = useRouteParam('id');

  const engagement = useEngagement(id);
  const rate = useRateRequest(id);

  const [stars, setStars] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  if (showQuerySkeleton(engagement)) {
    return (
      <Screen className="flex min-h-[100dvh] flex-col">
        <LoadingState />
      </Screen>
    );
  }

  if (!engagement.data) {
    return (
      <Screen className="flex min-h-[100dvh] flex-col">
        <Header title="" onClose={() => router.back()} />
        {engagement.isError ? (
          <EmptyState
            layout="screen"
            icon="star-outline"
            title="Could not load"
            message="Go back and try rating again."
            action={{ label: 'Go back', onPress: () => router.back() }}
          />
        ) : (
          <LoadingState />
        )}
      </Screen>
    );
  }

  const data = engagement.data;
  const firstName = data.counterparty_display_name?.split(' ')[0] ?? 'them';

  return (
    <Screen className="flex min-h-[100dvh] flex-col">
      <Header title="" onClose={() => router.back()} />

      <div className="flex min-h-0 flex-1 flex-col justify-between gap-8 overflow-y-auto p-5 pb-12">
        <div className="flex flex-col items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft">
            <IonIcon icon={ionIcons['checkmark-circle']} size={32} color={colors.brand} />
          </span>
          <h2 className="text-center text-2xl font-bold text-ink">Request completed!</h2>
          <p className="text-center text-base text-muted">
            Thanks for using Active. How was your experience?
          </p>

          <Avatar path={data.counterparty_avatar_path} name={data.counterparty_display_name} size="lg" />
          <p className="text-center text-lg font-semibold text-ink">
            {data.viewer_is_requester
              ? `How did ${firstName} do?`
              : `How was working with ${firstName}?`}
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <StarPicker value={stars} onChange={setStars} />

          {stars !== null ? (
            <TextAreaField
              label={PROMPTS[stars - 1] ?? 'Anything to add?'}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Optional"
              maxLength={500}
              counterMax={500}
            />
          ) : null}

          {rate.isError ? <InlineError error={rate.error} /> : null}
        </div>

        <Button
          label="Submit rating"
          size="lg"
          corner="2xl"
          disabled={stars === null}
          loading={rate.isPending}
          onClick={() =>
            rate.mutate(
              { stars: stars as number, comment: comment.trim() || null },
              { onSuccess: () => router.back() },
            )
          }
        />
      </div>
    </Screen>
  );
}