export function DesktopOnlyPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-canvas px-8 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">Active</p>
      <h1 className="mt-2 text-xl font-bold text-ink">Use a mobile device</h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
        Active&apos;s marketplace is built for phones. Open this link on your Android or iPhone
        browser, or install the app from your home screen after you visit on mobile.
      </p>
      <p className="mt-6 text-sm text-subtle">
        Detection uses screen size and touch capabilities, not your browser name. If you are on a
        phone and still see this message, try rotating the device or opening the site in your
        browser rather than an in-app preview.
      </p>
      <p className="mt-4 break-all text-sm font-medium text-brand">{typeof window !== 'undefined' ? window.location.origin : ''}</p>
    </div>
  );
}
