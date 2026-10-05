import { loadPaystackConfig, type PaystackRuntimeConfig } from './env.ts';
import type {
  InitializeTransactionData,
  InitializeTransactionInput,
  PaystackApiResponse,
  VerifyTransactionData,
} from './types.ts';

export class PaystackApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'PaystackApiError';
  }
}

export class PaystackClient {
  private readonly config: PaystackRuntimeConfig;

  constructor(config?: PaystackRuntimeConfig) {
    this.config = config ?? loadPaystackConfig();
  }

  get publicKey(): string {
    return this.config.publicKey;
  }

  async initializeTransaction(
    input: InitializeTransactionInput,
  ): Promise<InitializeTransactionData> {
    if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) {
      throw new Error('amountKobo must be a positive integer');
    }

    if (!input.reference.trim()) {
      throw new Error('reference is required');
    }

    const body: Record<string, unknown> = {
      email: input.email,
      amount: input.amountKobo,
      reference: input.reference,
      currency: input.currency ?? 'NGN',
      metadata: input.metadata ?? {},
    };

    if (input.callbackUrl) {
      body.callback_url = input.callbackUrl;
    }

    const payload = await this.request<InitializeTransactionData>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return payload;
  }

  async verifyTransaction(reference: string): Promise<VerifyTransactionData> {
    const trimmed = reference.trim();
    if (!trimmed) {
      throw new Error('reference is required');
    }

    return this.request<VerifyTransactionData>(
      `/transaction/verify/${encodeURIComponent(trimmed)}`,
      { method: 'GET' },
    );
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;

    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.secretKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    let parsed: PaystackApiResponse<T> | null = null;

    try {
      parsed = (await response.json()) as PaystackApiResponse<T>;
    } catch {
      throw new PaystackApiError('Paystack returned a non-JSON response', response.status);
    }

    if (!response.ok || !parsed.status) {
      throw new PaystackApiError(parsed.message || 'Paystack request failed', response.status);
    }

    return parsed.data;
  }
}

let defaultClient: PaystackClient | null = null;

export function getPaystackClient(): PaystackClient {
  if (!defaultClient) {
    defaultClient = new PaystackClient();
  }
  return defaultClient;
}
