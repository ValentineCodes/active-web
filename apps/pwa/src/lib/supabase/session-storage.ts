/**
 * Browser session persistence for Supabase Auth.
 * Intentionally separate from the native SecureStore implementation.
 */

const CHUNK_SIZE = 1800;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function clearChunks(key: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    localStorage.removeItem(chunkKey(key, index));
  }
}

export const browserSessionStorage = {
  async getItem(key: string) {
    const count = Number(localStorage.getItem(key));
    if (!count) return null;

    const chunks: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const chunk = localStorage.getItem(chunkKey(key, index));
      if (chunk === null) return null;
      chunks.push(chunk);
    }
    return chunks.join('');
  },

  async setItem(key: string, value: string) {
    const previousCount = Number(localStorage.getItem(key)) || 0;
    const chunks: string[] = [];
    for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
      chunks.push(value.slice(offset, offset + CHUNK_SIZE));
    }
    for (const [index, chunk] of chunks.entries()) {
      localStorage.setItem(chunkKey(key, index), chunk);
    }
    for (let index = chunks.length; index < previousCount; index += 1) {
      localStorage.removeItem(chunkKey(key, index));
    }
    localStorage.setItem(key, String(chunks.length));
  },

  async removeItem(key: string) {
    const count = Number(localStorage.getItem(key)) || 0;
    await clearChunks(key, count);
    localStorage.removeItem(key);
  },
};
