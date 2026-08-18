import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * TTL cache backed by AsyncStorage with an in-memory read-through layer.
 *
 * Two jobs: keep the map instant when you background and reopen the app,
 * and keep provider request counts low enough to sit inside a starter data
 * plan. The TTL is chosen by the caller because free and Pro accounts get
 * deliberately different freshness.
 */

const PREFIX = 'finviz-map:v1:';

interface Entry<T> {
  value: T;
  storedAt: number;
}

const memory = new Map<string, Entry<unknown>>();

function fresh(entry: Entry<unknown>, ttlMs: number): boolean {
  return Date.now() - entry.storedAt < ttlMs;
}

export async function readCache<T>(
  key: string,
  ttlMs: number
): Promise<T | undefined> {
  const hit = memory.get(key);
  if (hit && fresh(hit, ttlMs)) return hit.value as T;

  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return undefined;

    const entry = JSON.parse(raw) as Entry<T>;
    if (!fresh(entry, ttlMs)) return undefined;

    memory.set(key, entry);
    return entry.value;
  } catch {
    // A corrupt or unreadable cache entry is never worth failing a fetch over.
    return undefined;
  }
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  const entry: Entry<T> = { value, storedAt: Date.now() };
  memory.set(key, entry);
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Storage full or unavailable — the memory layer still serves this session.
  }
}

/**
 * Returns whatever is cached regardless of age.
 *
 * Used to keep a stale map on screen when the network is down, rather than
 * dropping the user onto an empty error state.
 */
export async function readStale<T>(
  key: string
): Promise<{ value: T; storedAt: number } | undefined> {
  const hit = memory.get(key);
  if (hit) return { value: hit.value as T, storedAt: hit.storedAt };

  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    return JSON.parse(raw) as Entry<T>;
  } catch {
    return undefined;
  }
}

export async function clearCache(): Promise<void> {
  memory.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(PREFIX)));
  } catch {
    // Nothing actionable; the memory cache is already cleared.
  }
}
