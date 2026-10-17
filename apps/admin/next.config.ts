import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(configDir, '../..');

// Monorepo uses a single root `.env` (EXPO_PUBLIC_*). Load it before reading config.
loadEnvConfig(monorepoRoot);
loadEnvConfig(configDir);

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
  '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  '';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: monorepoRoot,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
  },
};

export default nextConfig;
