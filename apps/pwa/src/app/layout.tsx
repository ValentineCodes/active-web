import type { Metadata, Viewport } from 'next';

import { AppProviders } from '@/providers/AppProviders';

import '@/styles/index.css';

/** Entire PWA is browser-session driven (Supabase localStorage, gates, camera). */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Active',
  description: 'Active — get help or get paid in Nigeria.',
  applicationName: 'Active',
  appleWebApp: {
    capable: true,
    title: 'Active',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/icon-192.png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#166A3D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
