import { supabase } from '@/lib/supabase/client';

/**
 * When another tab mutates Supabase auth localStorage, reconcile session in this tab.
 */
export function bindAuthStorageSync(onReconcile: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (!event.key) return;
    if (!event.key.includes('-auth-token')) return;
    onReconcile();
  };

  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

export async function reconcileSessionFromStorage() {
  await supabase.auth.getSession();
}
