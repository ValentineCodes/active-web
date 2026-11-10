import { Badge } from '@/components/ui/Badge';

export function RequestMetaRow({
  badgeLabel,
  badgeTone,
  trailing,
}: {
  badgeLabel: string;
  badgeTone: 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';
  trailing: string;
}) {
  return (
    <div className="flex flex-row items-center justify-between gap-3">
      <Badge label={badgeLabel} tone={badgeTone} dot={false} />
      <p className="text-sm text-muted">{trailing}</p>
    </div>
  );
}
