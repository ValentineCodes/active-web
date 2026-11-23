const offsets = new Map<string, number>();

export function readScrollOffset(key: string): number {
  return offsets.get(key) ?? 0;
}

export function writeScrollOffset(key: string, offset: number) {
  if (!Number.isFinite(offset) || offset < 0) return;
  offsets.set(key, offset);
}