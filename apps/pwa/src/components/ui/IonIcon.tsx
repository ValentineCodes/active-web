import { cn } from '@/lib/cn';

function svgMarkupFromDataUri(dataUri: string, size: number, color: string) {
  const raw = decodeURIComponent(dataUri.replace(/^data:image\/svg\+xml;utf8,/, ''));
  const sized = raw
    .replace('<svg ', `<svg width="${size}" height="${size}" `)
    .replace(/ class='[^']*'/g, '')
    .replace(/ class='ionicon-fill-none'/g, '')
    .replace(/ class='ionicon-stroke-width'/g, '');

  // Ionicons outline glyphs ship without `stroke` on `<path>` (styled via ionicons CSS in native).
  const withStrokes = sized.replace(/<path([^>]*)\/>/g, (match, attrs: string) => {
    if (/stroke-width/.test(attrs)) {
      if (/stroke=/.test(attrs)) return match;
      return `<path${attrs} stroke="${color}" fill="none"/>`;
    }
    if (/fill=/.test(attrs)) return match;
    return `<path${attrs} fill="${color}"/>`;
  });

  return withStrokes;
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
