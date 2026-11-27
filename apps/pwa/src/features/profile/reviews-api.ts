'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/use-user-id';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export type ReceivedRating = {
  ratingId: string;
  requestId: string | null;
  projectAssignmentId: string | null;
  projectId: string | null;
  stars: number;
  comment: string | null;
  createdAt: string;
  raterId: string;
  raterDisplayName: string | null;
  raterAvatarPath: string | null;
};

function mapRow(row: {
  rating_id: string;
  request_id: string | null;
  project_assignment_id: string | null;
  project_id: string | null;
  stars: number;
  comment: string | null;
  created_at: string;
  rater_id: string;
  rater_display_name: string | null;
  rater_avatar_path: string | null;
}): ReceivedRating {
  return {
    ratingId: row.rating_id,
    requestId: row.request_id,
    projectAssignmentId: row.project_assignment_id,
    projectId: row.project_id,
    stars: row.stars,
    comment: row.comment,
    createdAt: row.created_at,
    raterId: row.rater_id,
    raterDisplayName: row.rater_display_name,
    raterAvatarPath: row.rater_avatar_path,
  };
}

export function receivedRatingsQueryOptions(userId: string) {
  return {
    queryKey: queryKeys.myReceivedRatings(userId),
    queryFn: async (): Promise<ReceivedRating[]> => {
      const { data, error } = await supabase.rpc('my_received_ratings');
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  };
}

export function useMyReceivedRatings() {
  const userId = useUserId();
  return useQuery({
    ...receivedRatingsQueryOptions(userId),
    enabled: Boolean(userId),
  });
}

export const PROFILE_SHEET_REVIEWS_PAGE_SIZE = 10;

function nextUserReviewsOffset(lastPage: ReceivedRating[], pageParam: number) {
  if (lastPage.length < PROFILE_SHEET_REVIEWS_PAGE_SIZE) return undefined;
  return pageParam + PROFILE_SHEET_REVIEWS_PAGE_SIZE;
}

export function useUserReceivedRatingsInfinite(userId: string | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.userReceivedRatings(userId ?? ''), 'pages'],
    enabled: Boolean(userId) && enabled,
    initialPageParam: 0,
    staleTime: 60_000,
    queryFn: async ({ pageParam }) => {
      if (!userId) throw new Error('User id is required.');
      const { data, error } = await supabase.rpc('list_user_received_ratings', {
        p_user_id: userId,
        p_limit: PROFILE_SHEET_REVIEWS_PAGE_SIZE,
        p_offset: pageParam,
      });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
    getNextPageParam: (lastPage, _pages, pageParam) => nextUserReviewsOffset(lastPage, pageParam),
  });
}
