'use client';

import { useEffect, useRef, useState } from 'react';

import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/cn';

export function RequestFlowHeader({
  title,
  onBack,
  menuActions,
}: {
  title: string;
  onBack: () => void;
  menuActions?: { label: string; onPress: () => void; destructive?: boolean }[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  const onMore = menuActions?.length
    ? () => {
        setMenuOpen((open) => !open);
      }
    : undefined;

  return (
    <div className="relative">
      <Header
        title={title}
        onBack={onBack}
        right={
          onMore ? (
            <div ref={menuRef} className="relative">
              <IconButton
                icon="ellipsis-horizontal"
                accessibilityLabel="More options"
                onClick={onMore}
              />
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-hairline bg-elevated py-1 shadow-raised"
                >
                  {menuActions!.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      role="menuitem"
                      className={cn(
                        'w-full px-4 py-2.5 text-left text-sm font-medium active:bg-surface',
                        action.destructive ? 'text-danger' : 'text-ink',
                      )}
                      onClick={() => {
                        setMenuOpen(false);
                        action.onPress();
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
