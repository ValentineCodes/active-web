import { supabase } from '@/lib/supabase/client';

import {
  localDateIso,
  localTimeIso,
  REQUEST_EXPIRY_TIMEZONE,
  type RequestExpiryMode,
  validateRequestExpiryChoice,
} from '@/features/requests/request-expiry-core';

export {
  defaultFutureExpiryDate,
  expirySummaryLabel,
  localDateIso,
  localTimeIso,
  REQUEST_EXPIRY_TIMEZONE,
  validateRequestExpiryChoice,
  type RequestExpiryMode,
} from '@/features/requests/request-expiry-core';

const DEFAULT_LOCAL_TIME = '23:59:59';

export async function resolveRequestExpiresAtIso(input: {
  mode: RequestExpiryMode;
  futureAt: Date;
}): Promise<string> {
  const localDate =
    input.mode === 'today' ? localDateIso(new Date()) : localDateIso(input.futureAt);
  const localTime =
    input.mode === 'today' ? DEFAULT_LOCAL_TIME : localTimeIso(input.futureAt);

  const expiryError = validateRequestExpiryChoice(input.mode, input.futureAt);
  if (expiryError) throw new Error(expiryError);

  const { data, error } = await supabase.rpc('project_funding_deadline_at', {
    p_local_date: localDate,
    p_timezone: REQUEST_EXPIRY_TIMEZONE,
    p_local_time: localTime,
  });

  if (error) throw error;
  if (!data) throw new Error('Could not compute the response deadline.');
  return data;
}