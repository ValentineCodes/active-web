'use client';

import { useEffect, useState } from 'react';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Props = {
  paths: string[];
};

export function ReportEvidence({ paths }: Props) {
  const [urls, setUrls] = useState<Array<{ path: string; url: string | null; error?: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (paths.length === 0) {
        setLoading(false);
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const next = await Promise.all(
        paths.map(async (path) => {
          const { data, error } = await supabase.storage.from('request-media').createSignedUrl(path, 3600);
          if (error) {
            return { path, url: null, error: error.message };
          }
          return { path, url: data.signedUrl };
        }),
      );
      if (!cancelled) {
        setUrls(next);
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [paths]);

  if (paths.length === 0) {
    return <p className="text-sm text-muted">No photos submitted with this report.</p>;
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading evidence…</p>;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {urls.map((item) => (
        <li key={item.path} className="rounded-lg border border-border bg-surface p-2">
          <p className="mb-2 truncate text-xs text-subtle">{item.path}</p>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt="User-submitted report evidence" className="max-h-64 w-full rounded object-cover" />
            </a>
          ) : (
            <p className="text-sm text-red-700">{item.error ?? 'Could not load image'}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
