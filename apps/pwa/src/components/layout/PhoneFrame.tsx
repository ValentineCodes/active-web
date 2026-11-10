import type { ReactNode } from 'react';

/** Centers the app column and sets canvas background (matches native phone width). */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col bg-canvas text-ink">
      {children}
    </div>
  );
}
