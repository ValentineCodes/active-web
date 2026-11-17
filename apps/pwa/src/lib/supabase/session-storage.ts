/**
 * Browser session persistence for Supabase Auth.
 * Intentionally separate from the native SecureStore implementation.
 */

const CHUNK_SIZE = 1800;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

function browserLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = window.localStorage;
    if (
      storage &&
      typeof storage.getItem === 'function' &&
      typeof storage.setItem === 'function' &&
      typeof storage.removeItem === 'function'
    ) {
      return storage;
    }
  } catch {
    // Blocked storage (private mode, sandboxed webview, partial polyfills).
  }
  return null;
}

function clearChunks(storage: Storage, key: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    storage.removeItem(chunkKey(key, index));
  }
}

export const browserSessionStorage = {
  async getItem(key: string) {
    const storage = browserLocalStorage();
    if (!storage) return null;

    try {
      const count = Number(storage.getItem(key));
      if (!count) return null;

      const chunks: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const chunk = storage.getItem(chunkKey(key, index));
        if (chunk === null) return null;
        chunks.push(chunk);
      }
      return chunks.join('');
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string) {
    const storage = browserLocalStorage();
    if (!storage) return;

    try {
      const previousCount = Number(storage.getItem(key)) || 0;
      const chunks: string[] = [];
      for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
        chunks.push(value.slice(offset, offset + CHUNK_SIZE));
      }
      for (const [index, chunk] of chunks.entries()) {
        storage.setItem(chunkKey(key, index), chunk);
      }
      for (let index = chunks.length; index < previousCount; index += 1) {
        storage.removeItem(chunkKey(key, index));
      }
      storage.setItem(key, String(chunks.length));
    } catch {
      // Ignore write failures — auth may fall back to in-memory session for this tab.
    }
  },

  async removeItem(key: string) {
    const storage = browserLocalStorage();
    if (!storage) return;

    try {
      const count = Number(storage.getItem(key)) || 0;
      clearChunks(storage, key, count);
      storage.removeItem(key);
    } catch {
      // Ignore.
    }
  },
};