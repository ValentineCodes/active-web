'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-canvas px-6 py-12 text-center">
      <h1 className="text-2xl font-semibold text-ink">Something went wrong</h1>
      <p className="mt-3 max-w-sm text-base text-muted">{error.message || 'Try refreshing the page.'}</p>
      <button
        type="button"
        className="mt-6 rounded-full bg-brand px-5 py-3 text-base font-semibold text-on-brand"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
