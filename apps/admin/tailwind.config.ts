import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        muted: '#64748b',
        subtle: '#94a3b8',
        surface: '#f8fafc',
        elevated: '#ffffff',
        border: '#e2e8f0',
        brand: {
          DEFAULT: '#0d9488',
          dark: '#0f766e',
          light: '#ccfbf1',
        },
        sidebar: {
          DEFAULT: '#0f172a',
          hover: '#1e293b',
          border: '#1e293b',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
