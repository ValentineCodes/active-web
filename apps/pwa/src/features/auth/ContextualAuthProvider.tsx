'use client';

import { useRouter } from '@/lib/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ContextualAuthSheet } from '@/components/auth/ContextualAuthSheet';
import {
  CONTEXTUAL_AUTH_COPY,
  clearPendingAction,
  readPendingAction,
  savePendingAction,
  type PendingActionInput,
} from '@/features/auth/pending-action';

const PROMPT_EVENT = 'active:contextual-auth-prompt';

type ContextualAuthContextValue = {
  requestAuth: (action: PendingActionInput) => void;
  openPendingPrompt: () => void;
};

const ContextualAuthContext = createContext<ContextualAuthContextValue | null>(null);

export function useContextualAuth() {
  const value = useContext(ContextualAuthContext);
  if (!value) {
    throw new Error('useContextualAuth must be used within ContextualAuthProvider');
  }
  return value;
}

export function useOptionalContextualAuth() {
  return useContext(ContextualAuthContext);
}

export function ContextualAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [actionType, setActionType] = useState<PendingActionInput['type']>('navigate');
  /** Vaul calls onClose when `open` becomes false — skip clearing intent when heading to `/sign-in`. */
  const keepPendingOnSheetCloseRef = useRef(false);

  const copy = CONTEXTUAL_AUTH_COPY[actionType];

  const openPendingPrompt = useCallback(() => {
    const pending = readPendingAction();
    if (!pending) return;
    setActionType(pending.type);
    setOpen(true);
  }, []);

  const requestAuth = useCallback((action: PendingActionInput) => {
    if (!savePendingAction(action)) return;
    setActionType(action.type);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onPrompt = () => openPendingPrompt();
    window.addEventListener(PROMPT_EVENT, onPrompt);
    return () => window.removeEventListener(PROMPT_EVENT, onPrompt);
  }, [openPendingPrompt]);

  const dismiss = useCallback(() => {
    setOpen(false);
    if (keepPendingOnSheetCloseRef.current) {
      keepPendingOnSheetCloseRef.current = false;
      return;
    }
    clearPendingAction();
  }, []);

  const goSignIn = useCallback(() => {
    keepPendingOnSheetCloseRef.current = true;
    setOpen(false);
    router.push('/sign-in');
  }, [router]);

  const value = useMemo(() => ({ requestAuth, openPendingPrompt }), [openPendingPrompt, requestAuth]);

  return (
    <ContextualAuthContext.Provider value={value}>
      {children}
      <ContextualAuthSheet
        open={open}
        contextHint={copy.hint}
        logInLabel={copy.logInLabel}
        onClose={dismiss}
        onSignUp={goSignIn}
        onLogIn={goSignIn}
      />
    </ContextualAuthContext.Provider>
  );
}

export function dispatchContextualAuthPrompt(): void {
  window.dispatchEvent(new CustomEvent(PROMPT_EVENT));
}