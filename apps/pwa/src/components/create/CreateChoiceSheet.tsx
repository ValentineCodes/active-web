'use client';

import { Drawer } from 'vaul';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useColors } from '@/theme/ThemeProvider';

export type CreateChoice = 'request' | 'project';

function CreateOptionCard({
  title,
  description,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: keyof typeof ionIcons;
  onClick: () => void;
}) {
  const colors = useColors();

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-1 flex-col gap-2 rounded-2xl border border-hairline bg-surface p-4 text-left active:opacity-90"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-active-soft">
        <IonIcon icon={ionIcons[icon]} size={24} color={colors.active} />
      </span>
      <span className="text-lg font-bold text-ink">{title}</span>
      <span className="text-sm leading-5 text-muted">{description}</span>
    </button>
  );
}

export function CreateChoiceSheet({
  open,
  onOpenChange,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (choice: CreateChoice) => void;
}) {
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
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-bold text-ink">Create</h2>
              <p className="text-base text-muted">Choose what you want to post on Active.</p>
            </div>
            <div className="flex flex-row gap-3">
              <CreateOptionCard
                title="Request"
                description="Find someone to do one job for you."
                icon="document-outline"
                onClick={() => onChoose('request')}
              />
              <CreateOptionCard
                title="Project"
                description="Raise funds and coordinate multiple workers."
                icon="people-outline"
                onClick={() => onChoose('project')}
              />
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}