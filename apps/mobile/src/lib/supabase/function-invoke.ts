import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';

import { env } from '@/lib/env';

type EdgeFunctionErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  status?: string;
};

function errorFromBody(body: EdgeFunctionErrorBody): Error | null {
  const message =
    typeof body.error === 'string'
      ? body.error
      : typeof body.message === 'string'
        ? body.message
        : null;
  if (!message) return null;

  const err = new Error(message);
  if (typeof body.code === 'string') {
    (err as Error & { code?: string }).code = body.code;
  }
  return err;
}

async function readHttpErrorBody(response: Response): Promise<EdgeFunctionErrorBody | null> {
  try {
    const contentType = response.headers.get('Content-Type') ?? '';
    if (contentType.includes('application/json')) {
      return (await response.json()) as EdgeFunctionErrorBody;
    }
    const text = await response.text();
    if (!text.trim()) return null;
    try {
      return JSON.parse(text) as EdgeFunctionErrorBody;
    } catch {
      return { message: text };
    }
  } catch {
    return null;
  }
}

function isLocalSupabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

function notFoundMessage(functionName?: string): Error {
  const local = isLocalSupabaseUrl(env.supabaseUrl);
  if (functionName === 'paystack-banks') {
    const hint = local
      ? 'Bank list needs Edge Functions running locally. In the project root run pnpm db:serve (with pnpm db:start already up), then reload.'
      : 'Bank list is not available on this project yet. Deploy paystack-banks and the other bank Edge Functions, then try again.';
    return new Error(hint);
  }

  const hint = local
    ? 'This action needs Edge Functions running locally. Run pnpm db:serve in the project root, then try again.'
    : 'This action is not available yet. Deploy the latest Edge Functions and try again.';
  return new Error(hint);
}

/**
 * Turns supabase.functions.invoke `error` values into user-facing Errors, including JSON bodies
 * from non-2xx Edge Function responses.
 */
export async function parseEdgeFunctionInvokeError(
  error: unknown,
  options?: { functionName?: string },
): Promise<Error | null> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context;
    if (response.status === 404) {
      return notFoundMessage(options?.functionName);
    }

    const body = await readHttpErrorBody(response);
    if (body) {
      const parsed = errorFromBody(body);
      if (parsed) return parsed;
    }

    if (response.status === 401) {
      return new Error('Please sign in again.');
    }

    return new Error('Something went wrong. Please try again.');
  }

  if (error instanceof FunctionsRelayError) {
    return new Error('Could not reach the server. Check your connection and try again.');
  }

  if (error instanceof FunctionsFetchError) {
    return new Error('Could not reach the server. Check your connection and try again.');
  }

  if (error && typeof error === 'object' && 'context' in error) {
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === 'function') {
      if (response.status === 404) {
        return notFoundMessage(options?.functionName);
      }
      const body = await readHttpErrorBody(response);
      if (body) {
        const parsed = errorFromBody(body);
        if (parsed) return parsed;
      }
    }
  }

  return null;
}

export function throwIfEdgeFunctionErrorPayload(data: unknown): void {
  if (!data || typeof data !== 'object') return;

  const body = data as EdgeFunctionErrorBody;
  if (body.status === 'error' && typeof body.error === 'string') {
    throw errorFromBody(body) ?? new Error(body.error);
  }

  if ('error' in body && typeof body.error === 'string' && !('status' in body)) {
    throw errorFromBody(body) ?? new Error(body.error);
  }
}

export async function readEdgeFunctionPayload<T>(
  data: unknown,
  error: unknown,
  options?: { functionName?: string },
): Promise<T> {
  if (error) {
    const parsed = await parseEdgeFunctionInvokeError(error, options);
    throw parsed ?? error;
  }

  throwIfEdgeFunctionErrorPayload(data);

  if (!data || typeof data !== 'object') {
    throw new Error('Unexpected response from server');
  }

  return data as T;
}
