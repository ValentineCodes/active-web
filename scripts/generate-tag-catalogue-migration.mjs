import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(root, 'scripts/tag-catalogue.raw.txt'), 'utf8');

const SINGLE_WORD_CATEGORIES = new Set([
  'HOME',
  'EVENTS',
  'FASHION',
  'TECHNOLOGY',
  'CREATIVE',
  'AGRICULTURE',
  'ANIMALS',
  'BUSINESS',
  'PROPERTY',
  'CONSTRUCTION',
  'SECURITY',
  'TRAVEL',
  'GENERAL',
]);

function isCategoryHeader(trimmed) {
  if (!/^[A-Z0-9 &,]+$/.test(trimmed)) return false;
  if (trimmed.includes('&')) return true;
  return SINGLE_WORD_CATEGORIES.has(trimmed);
}

/** @type {{ category: string; tags: string[] }[]} */
const sections = [];
let category = null;

for (const line of raw.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  if (isCategoryHeader(trimmed)) {
    category = trimmed;
    sections.push({ category, tags: [] });
    continue;
  }
  if (!category) continue;
  sections[sections.length - 1].tags.push(trimmed);
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const usedSlugs = new Set();
const rows = [];

function categorySlugPrefix(category) {
  const slug = slugify(category).slice(0, 14).replace(/-+$/g, '');
  return slug || 'tag';
}

for (const section of sections) {
  const categorySlug = categorySlugPrefix(section.category);
  for (const name of section.tags) {
    let slug = slugify(name);
    if (!slug) continue;
    if (usedSlugs.has(slug)) {
      const prefixed = `${categorySlug}-${slug}`.slice(0, 40).replace(/-+$/g, '');
      slug = usedSlugs.has(prefixed) ? `${prefixed.slice(0, 36)}-${usedSlugs.size}` : prefixed;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`Invalid slug "${slug}" for tag "${name}"`);
    }
    usedSlugs.add(slug);
    rows.push({ category: section.category, name, slug });
  }
}

const escape = (value) => value.replace(/'/g, "''");

const values = rows
  .map((row) => `  ('${escape(row.name)}', '${escape(row.slug)}', '${escape(row.category)}', true)`)
  .join(',\n');

const sql = `-- Tag catalogue categories (Reddit-style grouped picker).
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General';

ALTER TABLE public.tags DROP CONSTRAINT IF EXISTS tags_category_check;
ALTER TABLE public.tags
  ADD CONSTRAINT tags_category_check CHECK (
    char_length(btrim(category)) >= 1 AND char_length(btrim(category)) <= 80
  );

CREATE OR REPLACE FUNCTION public.list_tag_catalogue()
RETURNS TABLE (
  tag_id uuid,
  name text,
  slug text,
  category text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT t.id, t.name, t.slug, t.category
  FROM public.tags t
  WHERE t.is_active
  ORDER BY t.category ASC, t.name ASC;
$$;

GRANT ALL ON FUNCTION public.list_tag_catalogue() TO authenticated;
GRANT ALL ON FUNCTION public.list_tag_catalogue() TO service_role;

DROP FUNCTION IF EXISTS public.search_tags(text, integer);

CREATE OR REPLACE FUNCTION public.search_tags(
  p_query text DEFAULT '',
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  tag_id uuid,
  name text,
  slug text,
  category text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    t.id,
    t.name,
    t.slug,
    t.category
  FROM public.tags t
  WHERE t.is_active
    AND (
      btrim(coalesce(p_query, '')) = ''
      OR t.name ILIKE '%' || btrim(p_query) || '%'
      OR t.slug ILIKE '%' || regexp_replace(btrim(p_query), '^#', '') || '%'
      OR t.category ILIKE '%' || btrim(p_query) || '%'
    )
  ORDER BY t.category ASC, t.name ASC
  LIMIT greatest(1, least(coalesce(p_limit, 20), 200));
$$;

GRANT ALL ON FUNCTION public.search_tags(text, integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_tags(text, integer) TO service_role;

INSERT INTO public.tags (name, slug, category, is_active)
VALUES
${values}
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active;
`;

const outPath = join(root, 'supabase/migrations/20261008171000_tag_catalogue_categories.sql');
writeFileSync(outPath, sql);
console.log(`Wrote ${rows.length} tags to ${outPath}`);
