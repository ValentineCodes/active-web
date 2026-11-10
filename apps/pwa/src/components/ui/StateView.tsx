import { Button } from '@/components/ui/Button';
import { IonIcon } from '@/components/ui/IonIcon';
import { cn } from '@/lib/cn';
import { ionIcons, type IonIconName } from '@/components/ui/ion-icons';
import { toUserMessage } from '@/lib/supabase/errors';

export function LoadingState({ label }: { label?: string }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-3 p-8"
      role="status"
      aria-busy
    >
      <SpinnerRing />
      {label ? <p className="text-base text-muted">{label}</p> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  description,
  action,
  layout = 'screen',
}: {
  icon?: IonIconName;
  title: string;
  message?: string;
  description?: string;
  action?: { label: string; onPress: () => void };
  layout?: 'screen' | 'list';
}) {
  const body = message ?? description ?? '';
  return (
    <div
      className={cn(
        'w-full items-center gap-3 text-center',
        layout === 'list' ? 'flex flex-col px-2 py-8' : 'flex flex-1 flex-col justify-center p-8',
      )}
    >
      {icon ? (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft">
          <IonIcon icon={ionIcons[icon]} size={28} color="#166A3D" />
        </div>
      ) : null}
      <p className="text-lg font-semibold text-ink">{title}</p>
      {body ? <p className="max-w-xs text-base text-muted">{body}</p> : null}
      {action ? (
        <div className="mt-2 w-full max-w-sm">
          <Button label={action.label} onClick={action.onPress} />
        </div>
      ) : null}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="flex flex-row items-start gap-2 rounded-xl bg-active-soft p-3" role="status">
      <IonIcon icon={ionIcons['checkmark-circle']} size={18} color="#1FA35A" />
      <p className="flex-1 text-sm text-ink">{message}</p>
    </div>
  );
}

export function InlineError({
  error,
  message,
  onRetry,
}: {
  error?: unknown;
  message?: string;
  onRetry?: () => void;
}) {
  const text = error !== undefined ? toUserMessage(error) : (message ?? 'Something went wrong.');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-row items-start gap-2 rounded-xl bg-danger-soft p-3" role="alert">
        <IonIcon icon={ionIcons['alert-circle']} size={18} color="#DC2626" />
        <p className="flex-1 text-sm text-danger">{text}</p>
      </div>
      {onRetry ? (
        <button type="button" className="text-sm font-semibold text-brand" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

function SpinnerRing() {
  return (
    <div
      className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent"
      aria-hidden
    />
  );
}
