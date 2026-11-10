import { depositCallbackUrl } from '@/features/wallet/deposit-callback';
import { supabase } from '@/lib/supabase/client';

export { depositCallbackUrl, isDepositCallbackPath, referenceFromSearchParams } from '@/features/wallet/deposit-callback';

export type InitializeDepositResult = {
  deposit_id: string;
  reference: string;
  authorization_url: string;
  amount_kobo: number;
};

export type VerifyDepositResult = {
  status: string;
  reference: string;
  amount_kobo: number;
  wallet_credited: boolean;
  deposit_status?: string;
  already_fulfilled?: boolean;
  fulfillment_rejected?: boolean;
  rejection_reason?: string;
  timed_out?: boolean;
};

type CheckoutSession = {
  authorizationUrl: string;
  reference: string;
  amountKobo: number;
  depositId: string;
  amountMajor: number;
  returnTo?: string;
};

const CHECKOUT_KEY = 'active:wallet-deposit-checkout';
const PENDING_REF_KEY = 'active:wallet-deposit-pending-ref';
const RETURN_TO_KEY = 'active:wallet-deposit-return-to';

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setCheckoutSession(session: CheckoutSession): void {
  sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(session));
  sessionStorage.setItem(PENDING_REF_KEY, session.reference);
  if (session.returnTo) {
    sessionStorage.setItem(RETURN_TO_KEY, session.returnTo);
  } else {
    sessionStorage.removeItem(RETURN_TO_KEY);
  }
}

export function readPendingDepositReturnTo(): string | null {
  return sessionStorage.getItem(RETURN_TO_KEY);
}

export function clearPendingDepositContext(): void {
  sessionStorage.removeItem(RETURN_TO_KEY);
  sessionStorage.removeItem(CHECKOUT_KEY);
  sessionStorage.removeItem(PENDING_REF_KEY);
}

export function readPendingDepositReference(): string | null {
  return sessionStorage.getItem(PENDING_REF_KEY);
}

export function consumeCheckoutSession(): CheckoutSession | null {
  const session = readJson<CheckoutSession>(CHECKOUT_KEY);
  sessionStorage.removeItem(CHECKOUT_KEY);
  return session;
}

export async function initializeWalletDeposit(
  amountMajor: number,
): Promise<InitializeDepositResult> {
  const { data, error } = await supabase.functions.invoke('paystack-initialize', {
    body: {
      amount_naira: amountMajor,
      callback_url: depositCallbackUrl(),
    },
  });

  if (error) {
    throw error;
  }

  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    throw new Error(data.error);
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response from payment service');
  }

  const payload = data as InitializeDepositResult;
  if (!payload.authorization_url || !payload.reference) {
    throw new Error('Payment could not be started');
  }

  return payload;
}

export async function verifyWalletDeposit(reference: string): Promise<VerifyDepositResult> {
  const { data, error } = await supabase.functions.invoke('paystack-verify', {
    body: { reference },
  });

  if (error) {
    throw error;
  }

  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    throw new Error(data.error);
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid verify response');
  }

  return data as VerifyDepositResult;
}

export async function waitForWalletDepositSettlement(
  reference: string,
  options: { maxAttempts?: number; intervalMs?: number } = {},
): Promise<VerifyDepositResult> {
  const maxAttempts = options.maxAttempts ?? 15;
  const intervalMs = options.intervalMs ?? 2000;

  let last: VerifyDepositResult | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    last = await verifyWalletDeposit(reference);
    if (last.fulfillment_rejected) {
      return last;
    }
    if (last.wallet_credited || last.deposit_status === 'completed') {
      return last;
    }
    if (last.status !== 'success' && last.deposit_status === 'failed') {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (last) {
    return { ...last, timed_out: true };
  }
  throw new Error('Timed out waiting for payment confirmation');
}
