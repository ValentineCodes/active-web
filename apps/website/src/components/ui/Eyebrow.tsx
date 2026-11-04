import { ReactNode } from 'react';

export function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <div className={`eyebrow ${light ? 'eyebrow-light' : ''}`}>
      <span />
      <span>{children}</span>
    </div>
  );
}
