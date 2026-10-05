/** Paystack REST envelope (https://paystack.com/docs/api/) */
export type PaystackApiResponse<T> = {
  status: boolean;
  message: string;
  data: T;
};

export type InitializeTransactionInput = {
  email: string;
  amountKobo: number;
  reference: string;
  currency?: 'NGN';
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
};

export type InitializeTransactionData = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

export type PaystackTransactionData = {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  channel: string | null;
  metadata: Record<string, unknown> | null;
};

export type VerifyTransactionData = {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  channel: string | null;
  metadata: Record<string, unknown> | null;
  transaction_date?: string;
  gateway_response?: string;
};
