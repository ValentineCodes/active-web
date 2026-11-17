import { useParams } from '@/lib/navigation';

/** Reads a dynamic route segment as a plain string. */
export function useRouteParam(name: string): string {
  const params = useParams();
  const raw = params[name];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0] ?? '';
  return '';
}
