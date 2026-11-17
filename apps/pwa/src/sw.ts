/// <reference lib="webworker" />

import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkOnly, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher:
        /^https?:\/\/(127\.0\.0\.1|localhost|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?\/.*$/i,
      handler: new NetworkOnly(),
    },
    {
      matcher: /^https:\/\/.*\.supabase\.co\/.*/i,
      handler: new NetworkOnly(),
    },
    {
      matcher: /^https:\/\/.*\.paystack\.(com|co)\/.*/i,
      handler: new NetworkOnly(),
    },
  ],
});

serwist.addEventListeners();

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string } | null;
  if (data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});
