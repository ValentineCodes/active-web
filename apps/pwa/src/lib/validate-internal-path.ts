/** Same-origin app paths only — rejects protocol-relative and external URLs. */
export function validateInternalPath(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//')) return null;
  if (trimmed.includes('://')) return null;
  if (trimmed.includes('\\')) return null;
  return trimmed;
}