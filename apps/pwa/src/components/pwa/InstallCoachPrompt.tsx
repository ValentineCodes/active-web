'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

import { ActiveLogo } from '@/components/ui/ActiveLogo';
import { routeShowsHomeTabBar } from '@/components/navigation/home-tab-bar-routes';
import { readFloatingBottomOffset } from '@/components/ui/tab-bar-insets';
import { useMobileAccess } from '@/device/use-mobile-access';
import { usePathname } from '@/lib/navigation';
import { cn } from '@/lib/cn';
import {
  detectInstallCoachPlatform,
  installCoachInstruction,
} from '@/pwa/install-coach-platform';
import {
  readInstallCoachDismissed,
  readInstallCoachSessionSnoozed,
  setInstallCoachDismissed,
  setInstallCoachSessionSnoozed,
} from '@/pwa/install-coach-preferences';
import { useInstallPrompt } from '@/pwa/use-install-prompt';

const COACH_SUN = '#FACC15';
const PROMPT_DELAY_MS = 5000;

const brutalBtnBase =
  'inline-flex items-center justify-center font-bold border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] px-3 py-1.5 text-xs';

type CoachPhase = 'ask' | 'instruct' | 'collapsed';

function CoachBubble({ children }: { children: ReactNode }) {
  return (
    <div
      className="pointer-events-auto relative mb-4 ml-2 max-w-[220px] border-2 border-black p-3 text-sm font-bold text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
      style={{ backgroundColor: COACH_SUN }}
    >
      {children}
      <div
        className="absolute -bottom-2 left-6 h-4 w-4 -rotate-45 border-b-2 border-l-2 border-black"
        style={{ backgroundColor: COACH_SUN }}
        aria-hidden
      />
    </div>
  );
}

export function InstallCoachPrompt() {
  const pathname = usePathname();
  const mobile = useMobileAccess();
  const { isInstalled } = useInstallPrompt();
  const platform = useMemo(
    () => (typeof navigator !== 'undefined' ? detectInstallCoachPlatform() : 'other-mobile'),
    [],
  );
  const instruction = useMemo(() => installCoachInstruction(platform), [platform]);

  const [permanentlyDismissed, setPermanentlyDismissed] = useState(() => readInstallCoachDismissed());
  const [sessionSnoozed, setSessionSnoozed] = useState(() => readInstallCoachSessionSnoozed());
  const [phase, setPhase] = useState<CoachPhase>('ask');
  const showsTabBar = routeShowsHomeTabBar(pathname);
  const [bottomOffset, setBottomOffset] = useState<number | string>(24);
  const [promptRevealed, setPromptRevealed] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setPromptRevealed(true), PROMPT_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  useLayoutEffect(() => {
    setPermanentlyDismissed(readInstallCoachDismissed());
    setSessionSnoozed(readInstallCoachSessionSnoozed());
    const updateInset = () => {
      setBottomOffset(mobile ? readFloatingBottomOffset(showsTabBar) : 24);
    };
    updateInset();
    window.addEventListener('resize', updateInset);
    return () => window.removeEventListener('resize', updateInset);
  }, [mobile, showsTabBar]);

  const dismissPermanently = useCallback(() => {
    setInstallCoachDismissed(true);
    setPermanentlyDismissed(true);
  }, []);

  const snoozeForSession = useCallback(() => {
    setInstallCoachSessionSnoozed(true);
    setSessionSnoozed(true);
  }, []);

  const onNotNow = useCallback(() => {
    snoozeForSession();
  }, [snoozeForSession]);

  const onGotIt = useCallback(() => {
    dismissPermanently();
  }, [dismissPermanently]);

  const onShowSteps = useCallback(() => {
    setPhase('instruct');
  }, []);

  const onMascotPress = useCallback(() => {
    setPhase((current) => (current === 'collapsed' ? 'instruct' : 'collapsed'));
  }, []);

  if (pathname === '/install' || isInstalled || permanentlyDismissed || sessionSnoozed) return null;

  const showBubble =
    phase === 'instruct' || (phase === 'ask' && promptRevealed);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 mx-auto max-w-lg"
      style={{ bottom: bottomOffset }}
    >
      <div className="pointer-events-none flex flex-col items-start pl-3">
        {showBubble ? (
          <CoachBubble>
            {phase === 'ask' ? (
              <>
                <p className="mb-3">Install for Notifications</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={cn(brutalBtnBase, 'bg-zinc-900 text-white hover:bg-zinc-700')} onClick={onShowSteps}>
                    Yes
                  </button>
                  <button
                    type="button"
                    className={cn(brutalBtnBase, 'bg-white text-black hover:bg-zinc-100')}
                    onClick={onNotNow}
                  >
                    Not now
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="leading-snug">{instruction}</p>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className={cn(brutalBtnBase, 'bg-zinc-900 text-white hover:bg-zinc-700')}
                    onClick={onGotIt}
                  >
                    Got it
                  </button>
                </div>
              </>
            )}
          </CoachBubble>
        ) : null}

        <button
          type="button"
          className="pointer-events-auto relative z-10 flex h-16 w-16 cursor-pointer items-center justify-center overflow-hidden rounded-full border-4 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform active:scale-95"
          aria-label={showBubble ? 'Hide install hint' : 'Install for notifications'}
          aria-expanded={showBubble}
          onClick={() => {
            if (showBubble) setPhase('collapsed');
            else onMascotPress();
          }}
        >
          <ActiveLogo size={40} className="h-10 w-10" />
        </button>
      </div>
    </div>
  );
}