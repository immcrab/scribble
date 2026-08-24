/**
 * Best-effort fixed-window rate limiter using in-memory state. Workers
 * isolates are ephemeral and not shared across Cloudflare's edge locations,
 * so this bounds abuse from a single hot isolate rather than providing a
 * hard global guarantee — swap in Durable Objects or KV if you need that.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

const buckets = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
}
