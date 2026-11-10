import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

type MyAttendance = Database['public']['Views']['my_attendance']['Row'];

export type { MyAttendance };

export function useAttendance() {
  return useQuery({
    queryKey: queryKeys.attendance,
    queryFn: async (): Promise<MyAttendance> => {
      const { data, error } = await supabase
        .from('my_attendance')
        .select('user_id, attending_request_id, commitment_count, updated_at')
        .maybeSingle();

      if (error) throw error;

      return (
        data ?? {
          user_id: '',
          attending_request_id: null,
          commitment_count: 0,
          updated_at: null,
        }
      );
    },
  });
}

/** Selected/committed provider requests (schedule conflicts enforced at selection). */
export function providerCommitmentCount(attendance: MyAttendance | undefined): number {
  return attendance?.commitment_count ?? 0;
}

export function hasProviderCommitments(attendance: MyAttendance | undefined): boolean {
  return providerCommitmentCount(attendance) > 0;
}

/** Primary commitment for banners when the user has multiple non-conflicting jobs. */
export function primaryProviderCommitmentRequestId(
  attendance: MyAttendance | undefined,
): string | null {
  return attendance?.attending_request_id ?? null;
}
