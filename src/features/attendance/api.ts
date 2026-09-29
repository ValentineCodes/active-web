import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

type MyAttendance = Database['public']['Views']['my_attendance']['Row'];

export function useAttendance() {
  return useQuery({
    queryKey: queryKeys.attendance,
    queryFn: async (): Promise<MyAttendance> => {
      const { data, error } = await supabase
        .from('my_attendance')
        .select('user_id, attending_request_id, updated_at')
        .single();

      if (error) throw error;
      return data;
    },
  });
}

export function isAttendingAnotherRequest(
  attendance: MyAttendance | undefined,
  requestId: string,
): boolean {
  return attendance?.attending_request_id != null && attendance.attending_request_id !== requestId;
}

/** True when the user is attending a selected request, not merely pending responses elsewhere. */
export function isAttendingAnyRequest(attendance: MyAttendance | undefined): boolean {
  return attendance?.attending_request_id != null;
}
