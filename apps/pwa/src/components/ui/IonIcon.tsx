import { cn } from '@/lib/cn';

function svgMarkupFromDataUri(dataUri: string, size: number, color: string) {
  const raw = decodeURIComponent(dataUri.replace(/^data:image\/svg\+xml;utf8,/, ''));
  return raw
    .replace(
      "<svg ",
      `<svg width="${size}" height="${size}" stroke="${color}" fill="none" stroke-width="32" stroke-linecap="round" stroke-linejoin="round" `,
    )
    .replace(/ class='[^']*'/g, '');
}

type Props = {
  icon: string;
  size?: number;
  color?: string;
  className?: string;
  label?: string;
};

export function IonIcon({ icon, size = 24, color = 'currentColor', className, label }: Props) {
  const html = svgMarkupFromDataUri(icon, size, color);
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
