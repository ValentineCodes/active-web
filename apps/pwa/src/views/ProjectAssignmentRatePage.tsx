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
import { useProjectAssignment, useRateProjectAssignment } from '@/features/projects/project-api';
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

export function ProjectAssignmentRatePage() {
  const router = useRouter();
  const colors = useColors();
  const projectId = useRouteParam('id');
  const assignmentId = useRouteParam('assignmentId');

  const assignment = useProjectAssignment(assignmentId);
  const rate = useRateProjectAssignment(projectId, assignmentId);

  const [stars, setStars] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  const returnTo = projectId ? `/project/${projectId}/assignment/${assignmentId}` : '/home';

  if (showQuerySkeleton(assignment)) {
    return (
      <Screen className="flex min-h-[100dvh] flex-col">
        <LoadingState />
      </Screen>
    );
  }

  const row = assignment.data;

  if (!row || row.project_id !== projectId || !row.viewer_may_rate) {
    return (
      <Screen className="flex min-h-[100dvh] flex-col">
        <Header title="" onClose={() => router.push(returnTo)} />
        {assignment.isError ? (
          <EmptyState
            layout="screen"
            icon="star-outline"
            title="Could not load"
            message="This assignment may not be ready to rate yet."
            action={{ label: 'Go back', onPress: () => router.push(returnTo) }}
          />
        ) : (
          <EmptyState
            layout="screen"
            icon="star-outline"
            title="Already rated"
            message="You have already left a rating for this assignment."
            action={{ label: 'Go back', onPress: () => router.push(returnTo) }}
          />
        )}
      </Screen>
    );
  }

  const firstName = row.counterparty_display_name?.split(' ')[0] ?? 'them';

  return (
    <Screen className="flex min-h-[100dvh] flex-col">
      <Header title="" onClose={() => router.push(returnTo)} />

      <div className="flex min-h-0 flex-1 flex-col justify-between gap-8 overflow-y-auto p-5 pb-12">
        <div className="flex flex-col items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft">
            <IonIcon icon={ionIcons['checkmark-circle']} size={32} color={colors.brand} />
          </span>
          <h2 className="text-center text-2xl font-bold text-ink">Assignment complete</h2>
          <p className="text-center text-base text-muted">How was your experience on this project?</p>

          <Avatar
            path={row.counterparty_avatar_path}
            name={row.counterparty_display_name}
            size="lg"
          />
          <p className="text-center text-lg font-semibold text-ink">
            {row.viewer_is_creator
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
              {
                onSuccess: () => {
                  if (projectId && assignmentId) {
                    router.push(`/project/${projectId}/assignment/${assignmentId}`);
                  } else {
                    router.back();
                  }
                },
              },
            )
          }
        />
      </div>
    </Screen>
  );
}