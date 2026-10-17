import * as SecureStore from 'expo-secure-store';

/**
 * Session storage for Supabase Auth, backed by the device keychain/keystore.
 *
 * SecureStore rejects values over roughly 2 KB and a session with its tokens can exceed
 * that, so values are split across numbered keys with the chunk count held at the base
 * key. Without this, sign-in would fail on Android once the token grew.
 */
const CHUNK_SIZE = 1800;

const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function clearChunks(key: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, index));
  }
}

export const sessionStore = {
  async getItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(key));
    if (!count) return null;

    const chunks: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const chunk = await SecureStore.getItemAsync(chunkKey(key, index));
      // A partially written session is unusable; treat it as signed out.
      if (chunk === null) return null;
      chunks.push(chunk);
    }

    return chunks.join('');
  },

  async setItem(key: string, value: string) {
    const previousCount = Number(await SecureStore.getItemAsync(key)) || 0;

    const chunks: string[] = [];
    for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
      chunks.push(value.slice(offset, offset + CHUNK_SIZE));
    }

    for (const [index, chunk] of chunks.entries()) {
      await SecureStore.setItemAsync(chunkKey(key, index), chunk);
    }

    for (let index = chunks.length; index < previousCount; index += 1) {
      await SecureStore.deleteItemAsync(chunkKey(key, index));
    }

    await SecureStore.setItemAsync(key, String(chunks.length));
  },

  async removeItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(key)) || 0;
    await clearChunks(key, count);
    await SecureStore.deleteItemAsync(key);
  },
};
