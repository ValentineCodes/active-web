import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Active',
    short_name: 'Active',
    description: 'Get help or get paid — Active marketplace for Nigeria.',
    lang: 'en',
    theme_color: '#166A3D',
    background_color: '#FFFFFF',
    display: 'standalone',
    orientation: 'any',
    scope: '/',
    start_url: '/?source=pwa',
    categories: ['business', 'finance', 'lifestyle'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
