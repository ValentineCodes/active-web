'use client';

import { Suspense, type ComponentType } from 'react';

import { LoadingScreen } from '@/components/LoadingScreen';

/** Wraps client pages that call `useSearchParams` for Next.js static generation. */
export function withSearchParamsPage<P extends object>(Page: ComponentType<P>) {
  function Wrapped(props: P) {
    return (
      <Suspense fallback={<LoadingScreen label="Loading…" />}>
        <Page {...props} />
      </Suspense>
    );
  }
  Wrapped.displayName = `WithSearchParams(${Page.displayName ?? Page.name ?? 'Page'})`;
  return Wrapped;
}
