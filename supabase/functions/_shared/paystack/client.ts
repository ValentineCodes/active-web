import { readCachedBanks, writeCachedBanks } from './bank-list-cache.ts';
import { isValidNubanAccountNumber, isValidPaystackBankCode } from './nuban.ts';
import { loadPaystackConfig, type PaystackRuntimeConfig } from './env.ts';
import type {
  CreateTransferRecipientInput,
  InitializeTransactionData,
  InitializeTransactionInput,
  PaystackApiResponse,
  PaystackBank,
  ResolveAccountData,
  TransferRecipientData,
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

  async listBanks(): Promise<PaystackBank[]> {
    const cached = readCachedBanks();
    if (cached) {
      return cached;
    }

    const rows = await this.request<Array<{ name: string; code: string | number }>>(
      '/bank?currency=NGN',
      { method: 'GET' },
    );

    const banks = rows
      .map((row) => ({
        name: row.name?.trim() ?? '',
        code: String(row.code ?? '').trim(),
      }))
      .filter((row) => row.name.length > 0 && row.code.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    const byCode = new Map<string, PaystackBank>();
    for (const bank of banks) {
      if (!byCode.has(bank.code)) {
        byCode.set(bank.code, bank);
      }
    }
    const uniqueBanks = [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));

    writeCachedBanks(uniqueBanks);
    return uniqueBanks;
  }

  async resolveAccount(accountNumber: string, bankCode: string): Promise<ResolveAccountData> {
    const account = accountNumber.trim();
    const bank = bankCode.trim();

    if (!isValidNubanAccountNumber(account)) {
      throw new Error('account number must be 10 digits');
    }

    if (!isValidPaystackBankCode(bank)) {
      throw new Error('bank_code is invalid');
    }

    const query = new URLSearchParams({
      account_number: account,
      bank_code: bank,
    });

    return this.request<ResolveAccountData>(`/bank/resolve?${query.toString()}`, {
      method: 'GET',
      timeoutMs: 15_000,
    });
  }

  async createTransferRecipient(
    input: CreateTransferRecipientInput,
  ): Promise<TransferRecipientData> {
    const name = input.name.trim();
    const accountNumber = input.accountNumber.trim();
    const bankCode = input.bankCode.trim();

    if (!name) {
      throw new Error('account holder name is required');
    }

    if (!/^[0-9]{10}$/.test(accountNumber)) {
      throw new Error('account number must be 10 digits');
    }

    if (!bankCode) {
      throw new Error('bank_code is required');
    }

    return this.request<TransferRecipientData>('/transferrecipient', {
      method: 'POST',
      body: JSON.stringify({
        type: 'nuban',
        name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: 'NGN',
      }),
    });
  }

  private async request<T>(
    path: string,
    init: RequestInit & { timeoutMs?: number },
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const { timeoutMs, ...fetchInit } = init;

    let response: Response;
    try {
      response = await fetch(url, {
        ...fetchInit,
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          'Content-Type': 'application/json',
          ...(fetchInit.headers ?? {}),
        },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new PaystackApiError('Paystack request timed out', 0);
      }
      throw new PaystackApiError('Paystack network error', 0);
    }

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
