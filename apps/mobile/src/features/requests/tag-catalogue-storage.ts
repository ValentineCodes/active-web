import AsyncStorage from '@react-native-async-storage/async-storage';

import { queryKeys } from '@/lib/query/keys';
import { queryClient } from '@/lib/query/client';

type RequestTag = {
  id: string;
  name: string;
  slug: string;
  category: string;
};

const STORAGE_KEY = 'request-tag-catalogue';
const CACHE_SCHEMA_VERSION = 2;

type PersistedTagCatalogue = {
  schemaVersion: number;
  savedAt: number;
  tags: RequestTag[];
};

let memoryCatalogue: RequestTag[] | undefined;

export function getMemoryTagCatalogue(): RequestTag[] | undefined {
  return memoryCatalogue;
}

function setMemoryCatalogue(tags: RequestTag[]) {
  memoryCatalogue = tags;
}

function parseTags(raw: unknown): RequestTag[] | null {
  if (!Array.isArray(raw)) return null;

  const tags: RequestTag[] = [];
  for (const item of raw) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof item.id !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.slug !== 'string' ||
      typeof item.category !== 'string'
    ) {
      return null;
    }
    tags.push({
      id: item.id,
      name: item.name,
      slug: item.slug,
      category: item.category,
    });
  }

  return tags.length > 0 ? tags : null;
}

export async function readPersistedTagCatalogue(): Promise<RequestTag[] | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PersistedTagCatalogue;
    if (parsed.schemaVersion !== CACHE_SCHEMA_VERSION) return null;
    return parseTags(parsed.tags);
  } catch {
    return null;
  }
}

export async function persistTagCatalogue(tags: RequestTag[]): Promise<void> {
  if (tags.length === 0) return;

  const payload: PersistedTagCatalogue = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    savedAt: Date.now(),
    tags,
  };

  setMemoryCatalogue(tags);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export async function hydrateTagCatalogueCache(): Promise<void> {
  const tags = await readPersistedTagCatalogue();
  if (!tags) return;

  setMemoryCatalogue(tags);
  queryClient.setQueryData(queryKeys.requestTagsCatalogue, tags);
}

void hydrateTagCatalogueCache();
