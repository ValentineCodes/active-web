import { PaystackApiError } from './client.ts';

export type ResolutionErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'rate_limited'
  | 'provider_unavailable';

export type ResolutionSuccessBody = {
  status: 'resolved';
  bank_code: string;
  account_number: string;
  account_name: string;
};

export type ResolutionErrorBody = {
  status: 'error';
  code: ResolutionErrorCode;
  error: string;
};

export type BanksSuccessBody = {
  status: 'ok';
  banks: Array<{ code: string; name: string }>;
};

export type BanksErrorBody = {
  status: 'error';
  code: 'provider_unavailable' | 'rate_limited';
  error: string;
};

export function resolutionSuccess(input: {
  bankCode: string;
  accountNumber: string;
  accountName: string;
}): ResolutionSuccessBody {
  return {
    status: 'resolved',
    bank_code: input.bankCode,
    account_number: input.accountNumber,
    account_name: input.accountName.trim(),
  };
}

export function mapResolutionFailure(error: unknown): {
  status: number;
  body: ResolutionErrorBody;
} {
  if (error instanceof PaystackApiError) {
    const lower = error.message.toLowerCase();

    if (error.httpStatus === 429) {
      return {
        status: 429,
        body: {
          status: 'error',
          code: 'rate_limited',
          error: 'Too many lookups. Wait a moment and try again.',
        },
      };
    }

    if (error.httpStatus === 422 || lower.includes('could not resolve')) {
      return {
        status: 422,
        body: {
          status: 'error',
          code: 'not_found',
          error: 'We could not find an account with that number for this bank.',
        },
      };
    }

    if (error.httpStatus >= 500 || error.httpStatus === 0) {
      return {
        status: 503,
        body: {
          status: 'error',
          code: 'provider_unavailable',
          error: 'Bank lookup is temporarily unavailable. Try again.',
        },
      };
    }

    return {
      status: 400,
      body: {
        status: 'error',
        code: 'invalid_input',
        error: 'Invalid bank account details.',
      },
    };
  }

  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.message.toLowerCase().includes('timed out')) {
      return {
        status: 503,
        body: {
          status: 'error',
          code: 'provider_unavailable',
          error: 'Bank lookup is temporarily unavailable. Try again.',
        },
      };
    }

    if (error.message.includes('10 digits') || error.message.includes('bank_code')) {
      return {
        status: 400,
        body: {
          status: 'error',
          code: 'invalid_input',
          error: error.message,
        },
      };
    }
  }

  return {
    status: 503,
    body: {
      status: 'error',
      code: 'provider_unavailable',
      error: 'Bank lookup is temporarily unavailable. Try again.',
    },
  };
}

export function mapBanksListFailure(error: unknown): {
  status: number;
  body: BanksErrorBody;
} {
  if (error instanceof PaystackApiError) {
    if (error.httpStatus === 429) {
      return {
        status: 429,
        body: {
          status: 'error',
          code: 'rate_limited',
          error: 'Too many requests. Wait a moment and try again.',
        },
      };
    }

    const status = error.httpStatus >= 500 ? 503 : 502;
    return {
      status,
      body: {
        status: 'error',
        code: 'provider_unavailable',
        error: 'Could not load banks right now. Try again.',
      },
    };
  }

  if (error instanceof Error) {
    const message = error.message;
    if (message.includes('PAYSTACK_SECRET_KEY') || message.includes('PAYSTACK_PUBLIC_KEY')) {
      return {
        status: 503,
        body: {
          status: 'error',
          code: 'provider_unavailable',
          error: 'Bank list is unavailable because Paystack is not configured on the server.',
        },
      };
    }

    if (message.includes('Paystack test mode')) {
      return {
        status: 503,
        body: {
          status: 'error',
          code: 'provider_unavailable',
          error: 'Bank list is unavailable until Paystack test keys are set on the server.',
        },
      };
    }

    if (message.includes('Supabase environment is not configured')) {
      return {
        status: 503,
        body: {
          status: 'error',
          code: 'provider_unavailable',
          error: 'Bank list is temporarily unavailable. Try again.',
        },
      };
    }
  }

  return {
    status: 503,
    body: {
      status: 'error',
      code: 'provider_unavailable',
      error: 'Could not load banks right now. Try again.',
    },
  };
}
