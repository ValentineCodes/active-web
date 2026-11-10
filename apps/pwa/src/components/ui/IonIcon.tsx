import { cn } from '@/lib/cn';

/** Ionicons outline default in 512 viewBox (was applied via `ionicon-stroke-width` CSS). */
const IONICON_OUTLINE_STROKE = 32;

function svgMarkupFromDataUri(dataUri: string, size: number, color: string) {
  const raw = decodeURIComponent(dataUri.replace(/^data:image\/svg\+xml;utf8,/, ''));
  const sized = raw
    .replace('<svg ', `<svg width="${size}" height="${size}" `)
    .replace(/ class='[^']*'/g, '');

  const paintOutlineNode = (tag: string, attrs: string) => {
    const isOutlineGlyph =
      /stroke-width/.test(attrs) ||
      /stroke-linecap/.test(attrs) ||
      /stroke-linejoin/.test(attrs) ||
      /stroke-miterlimit/.test(attrs);
    if (isOutlineGlyph || tag === 'circle') {
      if (/stroke=/.test(attrs)) return `<${tag}${attrs}/>`;
      const strokeWidth = /stroke-width=/.test(attrs)
        ? ''
        : ` stroke-width="${IONICON_OUTLINE_STROKE}"`;
      return `<${tag}${attrs} stroke="${color}" fill="none"${strokeWidth}/>`;
    }
    if (/fill=/.test(attrs)) return `<${tag}${attrs}/>`;
    return `<${tag}${attrs} fill="${color}"/>`;
  };

  // Ionicons outline glyphs ship without `stroke` (styled via ionicons CSS in native).
  return sized.replace(/<(path|circle|rect|ellipse|line|polyline)([^>]*)\/>/g, (match, tag: string, attrs: string) =>
    paintOutlineNode(tag, attrs),
  );
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
