import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { serwist } from '@serwist/vite';
import { defineConfig, loadEnv } from 'vite';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(configDir, '../..');

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, monorepoRoot, ''),
    ...loadEnv(mode, configDir, ''),
  };

  const supabaseUrl =
    env.VITE_PUBLIC_SUPABASE_URL?.trim() ||
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
    '';
  const supabaseAnonKey =
    env.VITE_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    '';

  return {
    envDir: configDir,
    plugins: [
      react(),
      tailwindcss(),
      serwist({
        swSrc: 'src/sw.ts',
        swDest: 'sw.js',
        globDirectory: 'dist',
        injectionPoint: 'self.__SW_MANIFEST',
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(configDir, './src'),
      },
    },
    define: {
      'import.meta.env.VITE_PUBLIC_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
    server: {
      port: 3002,
      host: '0.0.0.0',
      strictPort: true,
    },
    preview: {
      port: 3002,
      host: '0.0.0.0',
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});