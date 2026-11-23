'use client';

import { type ReactNode } from 'react';
import { Drawer } from 'vaul';
import { faHandshake } from '@fortawesome/free-regular-svg-icons';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

export type CreateChoice = 'request' | 'project';

function FontAwesomeRegularIcon({
  path,
  viewBox,
  size,
  color,
}: {
  path: string;
  viewBox: string;
  size: number;
  color: string;
}) {
  return (
    <svg aria-hidden viewBox={viewBox} width={size} height={size}>
      <path fill={color} d={path} />
    </svg>
  );
}

function CreateOptionCard({
  title,
  caption,
  icon,
  onClick,
}: {
  title: string;
  caption: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-1 flex-col gap-2 rounded-2xl border border-hairline bg-surface p-4 text-left active:opacity-90"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-active-soft">{icon}</span>
      <span className="text-base font-semibold text-ink">{title}</span>
      <span className="text-sm leading-5 text-muted">{caption}</span>
    </button>
  );
}

const handshakeViewBox = `0 0 ${faHandshake.icon[0]} ${faHandshake.icon[1]}`;
const handshakePath = faHandshake.icon[4] as string;

export function CreateChoiceSheet({
  open,
  onOpenChange,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (choice: CreateChoice) => void;
}) {
  const colors = useColors();

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl bg-elevated px-5 pb-8 pt-4 outline-none"
        >
          <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-hairline" aria-hidden />
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-ink">What do you need?</h2>
            <div className="flex flex-row gap-3">
              <CreateOptionCard
                title="Ask for help"
                caption="One job, one helper nearby"
                icon={
                  <FontAwesomeRegularIcon
                    viewBox={handshakeViewBox}
                    path={handshakePath}
                    size={22}
                    color={colors.active}
                  />
                }
                onClick={() => onChoose('request')}
              />
              <CreateOptionCard
                title="Start a project"
                caption="Raise money and bring in workers"
                icon={<IonIcon icon={ionIcons['people-outline']} size={24} color={colors.active} />}
                onClick={() => onChoose('project')}
              />
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}