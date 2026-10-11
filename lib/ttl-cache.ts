/**
 * A small in-memory cache with an expiry and a size cap.
 *
 * Process-local, like the rate limiter: enough to stop one server repeating
 * the same upstream request, not a shared cache.
 */
export function createTtlCache<T>({
  ttlMs,
  maxEntries,
}: {
  ttlMs: number;
  maxEntries: number;
}) {
  const entries = new Map<string, { value: T; expiresAt: number }>();

  return {
    get(key: string, now = Date.now()): T | undefined {
      const entry = entries.get(key);

      if (!entry) return undefined;

      if (entry.expiresAt <= now) {
        entries.delete(key);
        return undefined;
      }

      return entry.value;
    },

    set(key: string, value: T, now = Date.now()) {
      // Re-inserting moves the key to the end, so the first key is always the
      // one written longest ago.
      entries.delete(key);

      for (const [storedKey, entry] of entries) {
        if (entry.expiresAt <= now) entries.delete(storedKey);
      }

      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }

      entries.set(key, { value, expiresAt: now + ttlMs });
    },

    get size() {
      return entries.size;
    },
  };
}
