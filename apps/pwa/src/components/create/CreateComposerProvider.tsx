'use client';

import { useRouter } from '@/lib/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  armCreateComposerReturn,
  clearCreateComposerReturn,
  consumeCreateComposerReturn,
} from '@/features/navigation/create-tab-return';
import { useTrackTabForCreateReturn } from '@/features/navigation/use-track-tab-for-create-return';
import { CreateChoiceSheet, type CreateChoice } from '@/components/create/CreateChoiceSheet';

type CreateComposerContextValue = {
  isOpen: boolean;
  openCreateComposer: () => void;
  close: () => void;
  leaveAfterSuccess: (href: string) => void;
};

const CreateComposerContext = createContext<CreateComposerContextValue | null>(null);

export function useCreateComposer() {
  const value = useContext(CreateComposerContext);
  if (!value) {
    throw new Error('useCreateComposer must be used within CreateComposerProvider');
  }
  return value;
}

export function useOptionalCreateComposer() {
  return useContext(CreateComposerContext);
}

export function CreateComposerProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [choiceOpen, setChoiceOpen] = useState(false);
  useTrackTabForCreateReturn();

  const close = useCallback(() => {
    setChoiceOpen(false);
    const returnTo = consumeCreateComposerReturn();
    if (returnTo) router.push(returnTo);
  }, [router]);

  const leaveAfterSuccess = useCallback(
    (href: string) => {
      clearCreateComposerReturn();
      setChoiceOpen(false);
      router.push(href);
    },
    [router],
  );

  const openCreateComposer = useCallback(() => {
    armCreateComposerReturn();
    setChoiceOpen(true);
  }, []);

  const onChoiceOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setChoiceOpen(true);
        return;
      }
      close();
    },
    [close],
  );

  const onChoose = useCallback(
    (choice: CreateChoice) => {
      setChoiceOpen(false);
      const href = choice === 'request' ? '/request/new' : '/project/new';
      // Let the choice sheet release focus before the pushed screen tries to autofocus inputs.
      window.setTimeout(() => router.push(href), 280);
    },
    [router],
  );

  const value = useMemo(
    () => ({
      isOpen: choiceOpen,
      openCreateComposer,
      close,
      leaveAfterSuccess,
    }),
    [choiceOpen, openCreateComposer, close, leaveAfterSuccess],
  );

  return (
    <CreateComposerContext.Provider value={value}>
      {children}
      <CreateChoiceSheet open={choiceOpen} onOpenChange={onChoiceOpenChange} onChoose={onChoose} />
    </CreateComposerContext.Provider>
  );
}