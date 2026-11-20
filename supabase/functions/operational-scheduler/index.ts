import { createClient } from '@supabase/supabase-js';

import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const secret = Deno.env.get('OPERATIONAL_CRON_SECRET');
  const provided = req.headers.get('x-operational-cron-secret');
  if (!secret || provided !== secret) {
    return errorResponse('unauthorized', 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return errorResponse('misconfigured', 500);
  }

  const limit = Math.min(500, Math.max(1, Number(new URL(req.url).searchParams.get('limit') ?? 100)));

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: autoCount, error: autoError } = await supabase.rpc('auto_complete_due_requests', {
    p_limit: limit,
  });
  if (autoError) {
    return errorResponse(autoError.message, 500);
  }

  const { data: projectCount, error: projectError } = await supabase.rpc(
    'evaluate_due_project_funding',
    { p_limit: limit },
  );
  if (projectError) {
    return errorResponse(projectError.message, 500);
  }

  return jsonResponse({
    auto_complete_due_requests: autoCount ?? 0,
    evaluate_due_project_funding: projectCount ?? 0,
  });
});