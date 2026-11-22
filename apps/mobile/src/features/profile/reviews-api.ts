import { useQuery } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/session';
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
