/**
 * Pure helpers for the public /status page: shape the raw `stats/` tree from the Realtime
 * Database into what the page renders. No Firebase imports, so they stay unit-testable.
 */

export interface Counter {
  replies?: number;
  tokens?: number;
  chats?: number;
}

export interface SiteStats {
  totals?: Counter;
  models?: Record<string, Counter>;
  modes?: Record<string, Counter>;
  daily?: Record<string, Counter>;
}

export interface RankedModel<M> {
  model: M;
  slug: string;
  replies: number;
  tokens: number;
  /** 1-based; tied reply counts share a rank (same as a leaderboard). */
  rank: number;
  /** Share of the top model's replies, 0..1 — drives the bar width. */
  relative: number;
  /** Share of all ranked replies, 0..1. */
  share: number;
}

/** Ranks models by completed replies. Slugs with no matching catalog entry (retired models,
 * custom providers) are dropped, since the page has no name or icon for them. */
export function rankModels<M>(
  counters: Record<string, Counter | number> | null | undefined,
  bySlug: Map<string, M>
): RankedModel<M>[] {
  const rows = Object.entries(counters ?? {})
    .map(([slug, value]) => {
      const c: Counter = typeof value === "number" ? { replies: value } : value ?? {};
      return { slug, model: bySlug.get(slug), replies: num(c.replies), tokens: num(c.tokens) };
    })
    .filter((r): r is { slug: string; model: M; replies: number; tokens: number } => !!r.model && r.replies > 0)
    .sort((a, b) => b.replies - a.replies || b.tokens - a.tokens);
  const top = rows[0]?.replies ?? 1;
  const total = rows.reduce((n, r) => n + r.replies, 0) || 1;
  let rank = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.replies !== rows[i - 1].replies) rank = i + 1;
    return { ...r, rank, relative: r.replies / top, share: r.replies / total };
  });
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

export interface DayPoint {
  day: string; // YYYY-MM-DD, Central time
  replies: number;
  tokens: number;
  chats: number;
}

/** The status page keeps time in US Central (CDT in summer, CST in winter). */
export const STATUS_TIME_ZONE = "America/Chicago";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: STATUS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD for the Central-time calendar day containing `date`. Keys the daily counters. */
export function centralDayKey(date: Date = new Date()): string {
  return dayFormat.format(date);
}

/** "2:41:07 PM" in Central time; pass `withZone` to append "CDT" / "CST". */
export function centralClock(ms: number, withZone = false): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    timeZone: STATUS_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    ...(withZone ? { timeZoneName: "short" } : {}),
  });
}

/** "CDT" or "CST", whichever applies at `ms`. */
export function centralZoneName(ms: number = Date.now()): string {
  return new Date(ms).toLocaleTimeString("en-US", { timeZone: STATUS_TIME_ZONE, timeZoneName: "short" }).split(" ").pop() ?? "CT";
}

/** The last `count` Central-time days ending at `now`, oldest first, with zeros for days that saw no traffic. */
export function lastDays(daily: Record<string, Counter> | undefined, count: number, now: Date = new Date()): DayPoint[] {
  const out: DayPoint[] = [];
  const [y, m, d0] = centralDayKey(now).split("-").map(Number);
  for (let i = count - 1; i >= 0; i--) {
    const day = new Date(Date.UTC(y, m - 1, d0 - i)).toISOString().slice(0, 10);
    const c = daily?.[day];
    out.push({ day, replies: num(c?.replies), tokens: num(c?.tokens), chats: num(c?.chats) });
  }
  return out;
}

/** 1234 -> "1,234" for small numbers, "12.3k" / "4.56M" / "1.20B" once they get long. */
export function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 100_000) return `${Math.round(n / 1000)}k`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
}

/** "just now", "42s ago", "5m ago", "3h ago" — for the live ticker. */
export function timeAgo(then: number, now: number = Date.now()): string {
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}
