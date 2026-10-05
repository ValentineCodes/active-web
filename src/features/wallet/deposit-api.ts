import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase/client';

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
};

let checkoutSession: CheckoutSession | null = null;
/** Last initialized deposit reference (survives checkout session consume) for status recovery. */
let pendingDepositReference: string | null = null;

export function setCheckoutSession(session: CheckoutSession): void {
  checkoutSession = session;
  pendingDepositReference = session.reference;
}

export function readPendingDepositReference(): string | null {
  return pendingDepositReference;
}

export function consumeCheckoutSession(): CheckoutSession | null {
  const session = checkoutSession;
  checkoutSession = null;
  return session;
}

export function depositCallbackUrl(): string {
  return Linking.createURL('wallet/deposit/callback');
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

export function isDepositCallbackUrl(url: string): boolean {
  return /wallet\/deposit\/callback/.test(url);
}

export function referenceFromCallbackUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const fromQuery = parsed.searchParams.get('reference') ?? parsed.searchParams.get('trxref');
    if (fromQuery) return fromQuery;
  } catch {
    // Custom schemes (active://, exp://) may not parse in all runtimes.
  }

  const match = url.match(/[?&](?:reference|trxref)=([^&]+)/);
  if (!match?.[1]) return null;
  return decodeURIComponent(match[1]);
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
