import { StatusBar } from 'expo-status-bar';

import { useTheme } from '@/theme';

export function ThemeStatusBar() {
  const { resolved } = useTheme();
  return <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />;
}
