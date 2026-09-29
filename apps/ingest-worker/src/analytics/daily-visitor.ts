/**
 * Cookieless unique visitors. The Worker derives a visitor's identifier for one UTC day from that
 * day's random salt, the website, the visitor's address, and their user agent. The browser stores
 * nothing, the address is never stored, and once the day's salt is deleted (by the scheduled job,
 * after the day ends) nobody can link the day's identifiers to a visitor or to another day. The
 * same person on a later day, or on another website, counts as a new visitor.
 */
export interface DailySaltStore {
  dailyVisitorSalt(dayUtc: string): Promise<string | undefined>;
}

// One salt per isolate and day, so a busy Worker reads D1 about once a day, not once a request.
let cached: { day: string; salt: string } | undefined;

async function hmacHex(key: string, ...parts: string[]): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(parts.join('\0'))
  );
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
    ''
  );
}

/**
 * The visitor's identifier for today, or undefined when there is no client address or no salt (a
 * database older than schema 3); callers then fall back to the browser's per-page-load id.
 */
export async function dailyVisitorId(
  request: Request,
  store: DailySaltStore,
  now = new Date()
): Promise<string | undefined> {
  const address = request.headers.get('cf-connecting-ip');
  if (!address) return undefined;
  const day = now.toISOString().slice(0, 10);
  if (cached?.day !== day) {
    const salt = await store.dailyVisitorSalt(day).catch(() => undefined);
    if (!salt) return undefined;
    cached = { day, salt };
  }
  const userAgent = request.headers.get('user-agent') ?? '';
  return `daily-v1:${day}:${await hmacHex(cached.salt, address, userAgent)}`;
}

/** For tests: forget the cached salt. */
export function resetDailySaltCache(): void {
  cached = undefined;
}
