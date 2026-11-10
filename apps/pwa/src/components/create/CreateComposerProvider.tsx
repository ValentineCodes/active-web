'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Drawer } from 'vaul';

import {
  armCreateComposerReturn,
  clearCreateComposerReturn,
  consumeCreateComposerReturn,
} from '@/features/navigation/create-tab-return';
import { useTrackTabForCreateReturn } from '@/features/navigation/use-track-tab-for-create-return';
import { RequestNewContent } from '@/views/RequestNewPage';

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
  const [open, setOpen] = useState(false);
  useTrackTabForCreateReturn();

  const close = useCallback(() => {
    setOpen(false);
    const returnTo = consumeCreateComposerReturn();
    if (returnTo) router.push(returnTo);
  }, [router]);

  const leaveAfterSuccess = useCallback(
    (href: string) => {
      clearCreateComposerReturn();
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const openCreateComposer = useCallback(() => {
    armCreateComposerReturn();
    setOpen(true);
  }, []);

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setOpen(true);
        return;
      }
      close();
    },
    [close],
  );

  const value = useMemo(
    () => ({
      isOpen: open,
      openCreateComposer,
      close,
      leaveAfterSuccess,
    }),
    [open, openCreateComposer, close, leaveAfterSuccess],
  );

  return (
    <CreateComposerContext.Provider value={value}>
      {children}
      <Drawer.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[96dvh] max-h-[96dvh] flex-col rounded-t-2xl bg-canvas outline-none"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {open ? <RequestNewContent presentation="drawer" /> : null}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </CreateComposerContext.Provider>
  );
}
