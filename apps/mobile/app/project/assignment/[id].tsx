import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { ActivityCardListSkeleton } from '@/components/ui/content-skeletons';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { MARKET } from '@/config';
import {
  useAcceptProjectAssignment,
  useProjectAssignment,
  useProjectAssignmentMilestones,
  useProjectAssignmentSubmissions,
  useReserveProjectAssignmentCompensation,
  useStartProjectAssignment,
  useSubmitProjectAssignmentWork,
} from '@/features/projects/project-api';
import { formatMoney, formatWhenHome } from '@/lib/format';
import { showAppToast } from '@/lib/toast';

export default function ProjectAssignmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [note, setNote] = useState('');

  const assignment = useProjectAssignment(id);
  const milestones = useProjectAssignmentMilestones(id);
  const submissions = useProjectAssignmentSubmissions(id);
  const accept = useAcceptProjectAssignment();
  const reserve = useReserveProjectAssignmentCompensation();
  const start = useStartProjectAssignment();
  const submitWork = useSubmitProjectAssignmentWork();

  const row = assignment.data;

  useEffect(() => {
    if (row?.viewer_is_worker) {
      router.replace(`/project/${row.project_id}`);
    }
  }, [row?.project_id, row?.viewer_is_worker]);

  if (assignment.isPending) {
    return (
      <Screen>
        <Header title="Assignment" onBack={() => router.back()} />
        <ActivityCardListSkeleton count={2} />
      </Screen>
    );
  }

  if (assignment.isError) {
    return (
      <Screen>
        <Header title="Assignment" onBack={() => router.back()} />
        <InlineError error={assignment.error} onRetry={() => void assignment.refetch()} />
      </Screen>
    );
  }

  if (!row) {
    return (
      <Screen>
        <Header title="Assignment" onBack={() => router.back()} />
        <EmptyState
          layout="list"
          icon="lock-closed-outline"
          title="Assignment unavailable"
          message="You may not have access to this assignment."
        />
      </Screen>
    );
  }

  if (row.viewer_is_worker) {
    return (
      <Screen>
        <Header title="Assignment" onBack={() => router.back()} />
        <LoadingState label="Opening project…" />
      </Screen>
    );
  }

  const compensationMajor = row.compensation_total_kobo / 100;

  return (
    <Screen className="bg-canvas" edges={['top', 'bottom']}>
      <Header title="Assignment" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        <View className="gap-1">
          <Text className="font-display text-xl text-ink">{row.title}</Text>
          <Text className="text-sm capitalize text-muted">{row.status.replaceAll('_', ' ')}</Text>
          <Text className="text-base font-medium text-ink">
            {formatMoney(compensationMajor, MARKET.currency)} · {row.payment_structure}
          </Text>
          {row.due_at ? (
            <Text className="text-sm text-muted">Due {formatWhenHome(row.due_at)}</Text>
          ) : null}
        </View>

        {row.description ? <Text className="text-base text-ink">{row.description}</Text> : null}
        {row.deliverables ? (
          <View className="gap-1">
            <Text className="text-sm font-semibold text-ink">Deliverables</Text>
            <Text className="text-sm text-muted">{row.deliverables}</Text>
          </View>
        ) : null}

        <View className="rounded-2xl bg-surface p-3">
          <Text className="text-sm font-semibold text-ink">Compensation security</Text>
          <Text className="text-sm text-muted">
            {row.reservation_secured
              ? 'Assignment compensation is secured in the project pool.'
              : 'Compensation is not yet fully secured. Workers cannot commence until it is.'}
          </Text>
          {row.reservation_secured ? (
            <Text className="mt-1 text-xs text-subtle">
              Reserved {formatMoney(row.reservation_amount_kobo / 100, MARKET.currency)} · Released{' '}
              {formatMoney(row.reservation_released_kobo / 100, MARKET.currency)}
            </Text>
          ) : null}
        </View>

        {row.viewer_is_worker && row.status === 'offered' ? (
          <Button
            label={accept.isPending ? 'Accepting…' : 'Accept assignment'}
            onPress={() =>
              accept.mutate(row.assignment_id, {
                onSuccess: () => showAppToast('Assignment accepted', { type: 'success' }),
                onError: (error) =>
                  showAppToast(error instanceof Error ? error.message : 'Could not accept', 'warning'),
              })
            }
            loading={accept.isPending}
          />
        ) : null}

        {row.viewer_is_creator && !row.reservation_secured && row.status !== 'completed' ? (
          <Button
            label={reserve.isPending ? 'Reserving…' : 'Secure compensation from pool'}
            variant="secondary"
            onPress={() =>
              reserve.mutate(row.assignment_id, {
                onSuccess: () => showAppToast('Compensation secured', { type: 'success' }),
                onError: (error) =>
                  showAppToast(error instanceof Error ? error.message : 'Could not reserve', 'warning'),
              })
            }
            loading={reserve.isPending}
          />
        ) : null}

        {row.viewer_is_worker && row.status === 'accepted' && row.reservation_secured ? (
          <Button
            label={start.isPending ? 'Starting…' : 'Commence work'}
            onPress={() =>
              start.mutate(row.assignment_id, {
                onSuccess: () => showAppToast('Work commenced', { type: 'success' }),
                onError: (error) =>
                  showAppToast(error instanceof Error ? error.message : 'Cannot commence yet', 'warning'),
              })
            }
            loading={start.isPending}
          />
        ) : null}

        {row.viewer_is_worker && row.status === 'commenced' ? (
          <View className="gap-2 rounded-2xl border border-hairline p-3">
            <Text className="font-semibold text-ink">Submit work</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note for the creator"
              multiline
              className="min-h-[80px] rounded-xl bg-surface px-3 py-2 text-ink"
            />
            <Button
              label={submitWork.isPending ? 'Submitting…' : 'Submit'}
              onPress={() =>
                submitWork.mutate(
                  { assignmentId: row.assignment_id, note: note.trim() || undefined },
                  {
                    onSuccess: () => {
                      setNote('');
                      showAppToast('Submitted', { type: 'success' });
                    },
                    onError: (error) =>
                      showAppToast(
                        error instanceof Error ? error.message : 'Could not submit',
                        'warning',
                      ),
                  },
                )
              }
              loading={submitWork.isPending}
            />
          </View>
        ) : null}

        {(milestones.data?.length ?? 0) > 0 ? (
          <View className="gap-2">
            <Text className="text-sm font-semibold text-ink">Milestones</Text>
            {milestones.data?.map((milestone) => (
              <View key={milestone.milestone_id} className="rounded-xl bg-surface p-3">
                <Text className="font-medium text-ink">
                  {milestone.milestone_position}. {milestone.title}
                </Text>
                <Text className="text-sm capitalize text-muted">
                  {milestone.status.replaceAll('_', ' ')} ·{' '}
                  {formatMoney(milestone.amount_kobo / 100, MARKET.currency)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View className="gap-2">
          <Text className="text-sm font-semibold text-ink">Submission history</Text>
          {(submissions.data?.length ?? 0) === 0 ? (
            <Text className="text-sm text-muted">No submissions yet.</Text>
          ) : (
            submissions.data?.map((submission) => (
              <View key={submission.submission_id} className="rounded-xl bg-surface p-3">
                {submission.note ? <Text className="text-ink">{submission.note}</Text> : null}
                <Text className="text-xs text-muted">
                  {submission.submitted_at
                    ? formatWhenHome(submission.submitted_at)
                    : 'Submitted'}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}