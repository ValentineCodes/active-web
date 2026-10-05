export type PaystackRuntimeConfig = {
  secretKey: string;
  publicKey: string;
  baseUrl: string;
};

const DEFAULT_BASE_URL = 'https://api.paystack.co';

export function loadPaystackConfig(): PaystackRuntimeConfig {
  const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY')?.trim();
  const publicKey = Deno.env.get('PAYSTACK_PUBLIC_KEY')?.trim();
  const baseUrl = (Deno.env.get('PAYSTACK_BASE_URL')?.trim() || DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );

  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured');
  }

  if (!publicKey) {
    throw new Error('PAYSTACK_PUBLIC_KEY is not configured');
  }

  if (!secretKey.startsWith('sk_test_')) {
    throw new Error('Active only supports Paystack test mode (sk_test_ secret keys)');
  }

  if (!publicKey.startsWith('pk_test_')) {
    throw new Error('Active only supports Paystack test mode (pk_test_ public keys)');
  }

  return { secretKey, publicKey, baseUrl };
}
