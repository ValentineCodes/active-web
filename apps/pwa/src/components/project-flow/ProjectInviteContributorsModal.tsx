'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { PersonRow } from '@/components/ui/PersonRow';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { InlineError, LoadingState } from '@/components/ui/StateView';
import { useUserId } from '@/features/auth/use-user-id';
import { USERNAME_MIN_LENGTH } from '@/features/profile/username';
import {
  peopleSearchQueryMeetsMinLength,
  useInviteProjectContributor,
  useProjectContributorInvitations,
  useSearchPeople,
} from '@/features/projects/project-contributor-invite-api';
import { cn } from '@/lib/cn';
import { toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';

type Props = {
  open: boolean;
  projectId: string;
  onClose: () => void;
};

export function ProjectInviteContributorsModal({ open, projectId, onClose }: Props) {
  const userId = useUserId();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [pendingInviteeId, setPendingInviteeId] = useState<string | null>(null);

  const invite = useInviteProjectContributor();
  const existingInvitations = useProjectContributorInvitations(projectId, open);
  const invitedIds = useMemo(
    () => new Set(existingInvitations.data ?? []),
    [existingInvitations.data],
  );

  useEffect(() => {
    if (!open) {
      setDraft('');
      setQuery('');
      setPendingInviteeId(null);
      invite.reset();
      return;
    }
    const timer = window.setTimeout(() => setQuery(draft.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [draft, invite, open]);

  const searchReady = peopleSearchQueryMeetsMinLength(query);
  const peopleSearch = useSearchPeople(query, open);
  const people = useMemo(() => {
    const rows = peopleSearch.data ?? [];
    if (!userId) return rows;
    return rows.filter((person) => person.user_id !== userId);
  }, [peopleSearch.data, userId]);

  const invitePerson = useCallback(
    (inviteeId: string, displayName: string | null) => {
      if (invitedIds.has(inviteeId) || invite.isPending) return;
      setPendingInviteeId(inviteeId);
      invite.mutate(
        { projectId, inviteeId },
        {
          onSuccess: () => {
            setPendingInviteeId(null);
            const name = displayName?.trim() || 'them';
            showAppToast(`Invited ${name} to contribute`, { type: 'success' });
          },
          onError: (error) => {
            setPendingInviteeId(null);
            void existingInvitations.refetch();
            showAppToast(toUserMessage(error), 'warning');
          },
        },
      );
    },
    [existingInvitations, invite, invitedIds, projectId],
  );

  const handleDismiss = useCallback(() => {
    if (invite.isPending) return;
    onClose();
  }, [invite.isPending, onClose]);

  return (
    <BottomSheet
      open={open}
      onClose={handleDismiss}
      dismissible={!invite.isPending}
      className="max-h-[80dvh]"
    >
      <div className="flex min-h-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold text-ink">Invite to contribute</h2>
          <p className="text-base text-muted">Contributors are added to the group chat.</p>
        </div>

        <input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search by name or @username"
          aria-label="Search people to invite"
          className="w-full rounded-xl border-2 border-transparent bg-surface py-2.5 px-4 text-base text-ink outline-none placeholder:text-subtle focus:border-brand"
        />

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {!searchReady ? (
            query.length > 0 ? (
              <p className="text-sm text-muted">
                Enter at least {USERNAME_MIN_LENGTH} characters to search.
              </p>
            ) : null
          ) : peopleSearch.isPending ? (
            <LoadingState label="Searching…" />
          ) : peopleSearch.isError ? (
            <InlineError error={peopleSearch.error} onRetry={() => void peopleSearch.refetch()} />
          ) : people.length === 0 ? (
            <p className="text-sm text-muted">No people matched that search.</p>
          ) : (
            people.map((person) => {
              const invited = invitedIds.has(person.user_id);
              const sending = pendingInviteeId === person.user_id && invite.isPending;
              const inviteDisabled = invited || (invite.isPending && pendingInviteeId !== person.user_id);
              return (
                <div
                  key={person.user_id}
                  className="flex flex-row items-center gap-2 rounded-xl bg-surface p-3"
                >
                  <div className="min-w-0 flex-1">
                    <PersonRow
                      avatarPath={person.avatar_path}
                      name={person.display_name}
                      ratingAverage={person.rating_average}
                      ratingCount={person.rating_count}
                      identityVerified={person.identity_verified}
                      username={person.username}
                      size="sm"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={inviteDisabled}
                    onClick={() => invitePerson(person.user_id, person.display_name)}
                    className={cn(
                      'shrink-0 text-sm font-semibold active:opacity-90 disabled:opacity-50',
                      invited ? 'text-muted' : 'text-active',
                    )}
                  >
                    {invited ? 'Invited' : sending ? 'Inviting…' : 'Invite'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </BottomSheet>
  );
}