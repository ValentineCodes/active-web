export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_PREFERENCE_KEY = '@active/theme_preference';

function browserLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = window.localStorage;
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      return storage;
    }
  } catch {
    // Blocked storage (private mode, sandboxed webview, partial polyfills).
  }
  return null;
}

export function readThemePreference(): ThemePreference {
  const storage = browserLocalStorage();
  if (!storage) return 'system';
  try {
    const stored = storage.getItem(THEME_PREFERENCE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Ignore read failures.
  }
  return 'system';
}

export function writeThemePreference(preference: ThemePreference): void {
  const storage = browserLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(THEME_PREFERENCE_KEY, preference);
  } catch {
    // Ignore write failures.
  }
}

export function resolveThemeScheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}
