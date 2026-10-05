import type { SupabaseClient } from '@supabase/supabase-js';

export type DepositRecord = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  currency: string;
  reference: string;
};

/** Resolve an Active or Paystack payment reference to a pending/completed deposit row. */
export async function findDepositByPaymentReference(
  service: SupabaseClient,
  paymentReference: string,
): Promise<DepositRecord | null> {
  const ref = paymentReference.trim();
  if (!ref) {
    return null;
  }

  const { data, error } = await service
    .from('deposit_transactions')
    .select('id, user_id, amount, status, currency, reference')
    .or(`reference.eq.${ref},paystack_reference.eq.${ref}`)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
