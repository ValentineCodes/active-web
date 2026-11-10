import type { ReactNode } from 'react';

/** Centers the app column and sets canvas background (matches native phone width). */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex h-dvh max-h-dvh w-full max-w-lg flex-col overflow-hidden bg-canvas text-ink">
      {children}
    </div>
  );
}
