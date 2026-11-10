export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_PREFERENCE_KEY = '@active/theme_preference';

export function readThemePreference(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_PREFERENCE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

export function writeThemePreference(preference: ThemePreference): void {
  localStorage.setItem(THEME_PREFERENCE_KEY, preference);
}

export function resolveThemeScheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}
