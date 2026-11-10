export function depositCallbackUrl(): string {
  if (typeof window === 'undefined') return '/wallet/deposit/callback';
  return `${window.location.origin}/wallet/deposit/callback`;
}

export function isDepositCallbackPath(pathname: string): boolean {
  return pathname.includes('/wallet/deposit/callback');
}

export function referenceFromSearchParams(search: URLSearchParams): string | null {
  return search.get('reference') ?? search.get('trxref');
}
