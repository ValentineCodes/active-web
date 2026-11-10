'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { LoadingState } from '@/components/ui/StateView';
import { useRouteParam } from '@/lib/route-param';

/** Legacy `/respond/:id` links → `/request/:id` (helper view). */
export function RespondRedirectPage() {
  const router = useRouter();
  const id = useRouteParam('id');
  const search = useSearchParams();

  useEffect(() => {
    const query = search.toString();
    router.replace(query ? `/request/${id}?${query}` : `/request/${id}`);
  }, [id, router, search]);

  return <LoadingState label="Loading request…" />;
}
