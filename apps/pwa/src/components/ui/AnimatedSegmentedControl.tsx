'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

type Option<T extends string> = {
  value: T;
  label: string;
};

export function AnimatedSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
  optionClassName,
}: {
  value: T;
  options: readonly Option<T>[];
  onChange: (next: T) => void;
  className?: string;
  optionClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, visible: false });

  const selectedIndex = options.findIndex((option) => option.value === value);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const option = optionRefs.current[selectedIndex];
    if (!container || !option) return;

    const containerRect = container.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    setIndicator({
      left: optionRect.left - containerRect.left,
      width: optionRect.width,
      visible: true,
    });
  }, [options, selectedIndex, value]);

  return (
    <div
      ref={containerRef}
      className={cn('relative inline-flex flex-row rounded-full bg-surface p-1', className)}
      role="group"
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute bottom-1 top-1 rounded-full bg-elevated transition-[transform,width,opacity] duration-200 ease-out',
          indicator.visible ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          width: indicator.width,
          transform: `translateX(${indicator.left}px)`,
        }}
      />
      {options.map((option, index) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              optionRefs.current[index] = node;
            }}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              if (!selected) onChange(option.value);
            }}
            className={cn(
              'relative z-10 rounded-full px-4 py-2 text-sm font-semibold capitalize transition-colors duration-200 active:opacity-90',
              selected ? 'text-ink' : 'text-muted',
              optionClassName,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}