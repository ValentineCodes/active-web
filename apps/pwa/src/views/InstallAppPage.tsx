import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { useInstallPrompt } from '@/pwa/use-install-prompt';

function detectIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

export function InstallAppPage() {
  const { canPromptInstall, isInstalled, promptInstall } = useInstallPrompt();
  const showIosSteps = detectIosSafari() && !canPromptInstall && !isInstalled;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-6 px-5 py-8">
      <InstallIntro />

      {isInstalled ? (
        <p className="rounded-2xl border border-hairline bg-elevated px-4 py-4 text-sm text-muted">
          Active is installed on this device. Open it from your home screen for the full-screen experience.
        </p>
      ) : null}

      {canPromptInstall ? (
        <section className="rounded-2xl border border-hairline bg-elevated px-4 py-4">
          <h2 className="text-base font-semibold text-ink">Android Chrome</h2>
          <p className="mt-2 text-sm text-muted">
            Install Active like an app. You&apos;ll get a home-screen icon and a faster launch next time.
          </p>
          <div className="mt-4">
            <Button
              label="Install Active"
              onClick={() => {
                void promptInstall();
              }}
            />
          </div>
          <p className="mt-3 text-xs text-subtle">
            You can also use the browser menu → <span className="font-medium">Install app</span> or{' '}
            <span className="font-medium">Add to Home screen</span>.
          </p>
        </section>
      ) : null}

      {showIosSteps || (!canPromptInstall && !isInstalled) ? (
        <section className="rounded-2xl border border-hairline bg-elevated px-4 py-4">
          <h2 className="text-base font-semibold text-ink">iPhone &amp; iPad (Safari)</h2>
          <p className="mt-2 text-sm text-muted">
            iOS does not show an automatic install banner. Add Active to your home screen manually:
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>Open this site in <span className="font-medium text-ink">Safari</span> (not an in-app browser).</li>
            <li>
              Tap the <span className="font-medium text-ink">Share</span> button (square with an arrow).
            </li>
            <li>
              Scroll and tap <span className="font-medium text-ink">Add to Home Screen</span>, then confirm.
            </li>
            <li>Launch Active from the new icon on your home screen.</li>
          </ol>
          <p className="mt-3 text-xs text-subtle">
            In-app browsers (Instagram, WhatsApp, etc.) may not support install. Copy the link and open it in Safari
            first.
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-dashed border-hairline px-4 py-4">
        <h2 className="text-sm font-semibold text-ink">Notifications</h2>
        <p className="mt-2 text-sm text-muted">
          Browser push is not available in this version. Use the in-app Notifications tab for your inbox.
        </p>
      </section>

      <Link href="/home" className="text-center text-sm font-semibold text-brand">
        Back to Active
      </Link>
    </div>
  );
}

function InstallIntro() {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">Install</p>
      <h1 className="text-xl font-bold text-ink">Use Active from your home screen</h1>
      <p className="text-sm text-muted">
        The web app works best when installed. Marketplace, wallet, and chat require a phone browser or installed app.
      </p>
    </>
  );
}
