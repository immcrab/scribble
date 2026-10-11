import { get as dbGet, increment, onValue, ref, runTransaction, set, update } from "firebase/database";
import { getRtdb } from "./firebase";
import { centralDayKey } from "./statusSummary";
import { modelSlug } from "./modelSlug";
import type { Mode, ModelDef } from "../types";

/**
 * Anonymous, aggregate-only usage counters behind the "Top models" docs page.
 * Every completed (non-aborted, non-errored) assistant reply bumps one counter
 * at modelStats/{YYYY-MM}/{slug} — no uid, no chat content, nothing but "this
 * model finished a reply once". Custom-provider models are skipped since
 * they're per-user endpoints, not part of the shared catalog.
 *
 * Requires the Realtime Database rules to allow write (and read, for the docs
 * page) on the "modelStats" path — same open-by-path model already used by
 * "publicChats" (see cloudSync.ts). If the path isn't allowed, the increment
 * just fails silently and the feature has no data to show yet.
 */

let serverOffset = 0;
let watchingOffset = false;

/** Epoch ms on the Firebase server's clock. Ticker timestamps are written and read with this, so
 * a viewer's or sender's skewed system clock can't make "12s ago" wrong (or get the write rejected
 * by the rules' `now` window). Falls back to the local clock until the offset arrives. */
export function serverNow(): number {
  if (!watchingOffset) {
    watchingOffset = true;
    const db = getRtdb();
    if (db) {
      onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
        const v = snap.val();
        if (typeof v === "number" && Number.isFinite(v)) serverOffset = v;
      });
    }
  }
  return Date.now() + serverOffset;
}

export function monthKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function recordModelUsage(
  model: Pick<ModelDef, "modelId" | "provider">,
  extra: { tokens?: number; mode?: Mode; request?: RecentHandle | null; activity?: Activity } = {}
): void {
  if (model.provider === "custom") return;
  const db = getRtdb();
  if (!db) return;
  const slug = modelSlug(model.modelId);
  bumpMonthly(slug);
  recordSiteTotals({ slug, tokens: extra.tokens, mode: extra.mode });
  finishRecentRequest({ slug, tokens: extra.tokens, mode: extra.mode, handle: extra.request, activity: extra.activity });
}

function bumpMonthly(slug: string): void {
  const db = getRtdb();
  if (!db) return;
  runTransaction(ref(db, `modelStats/${monthKey()}/${slug}`), (current: number | null) => (current ?? 0) + 1).catch(() => {});
}

/** Stats keys for the non-chat modes: one per image model, and one for Text to Speech.
 * The /status page maps these back to names (see pages/StatusPage.tsx). */
export const imageStatsSlug = (imageModelId: string) => `image-${imageModelId}`;
export const SPEECH_STATS_SLUG = "tts";

/** Count one finished image or speech generation, same counters a chat reply feeds. */
export function recordMediaUsage(kind: "image" | "speech", slug: string, request?: RecentHandle | null): void {
  bumpMonthly(slug);
  recordSiteTotals({ slug, mode: kind });
  finishRecentRequest({ slug, mode: kind, handle: request, activity: kind });
}

/**
 * Feeds the "Recent requests" ticker on /status: a 60-slot ring at stats/recent/{0..59},
 * slot = the current second mod 60, so the newest entry replaces the oldest without any
 * cleanup job. Holds only {model slug, mode, est. tokens, time, state} — no uid, no text.
 * A request shows up as "run" the moment it is sent and flips to "done" when the reply
 * finishes. Requests that fail or get stopped just stay "run" until the page hides them as
 * stale. Kept separate from the counters so a rejected ticker write can never drop them.
 */
/** What a request is doing, shown on the ticker: "Coding…", "Searching the web…", etc. */
export type Activity = "chat" | "code" | "search" | "tools" | "image" | "speech";

export interface RecentRequest {
  m: string; // model slug
  t: number; // epoch ms the request was sent
  s?: "run" | "done";
  a?: Activity;
  k?: number; // estimated tokens
  mode?: string;
}

export interface RecentHandle {
  slot: number;
  t: number;
  entry: RecentRequest;
}

/** Call when a request is sent. Returns a handle to pass to recordModelUsage when it completes. */
export function beginRecentRequest(
  model: Pick<ModelDef, "modelId" | "provider">,
  mode?: Mode,
  activity: Activity = "chat"
): RecentHandle | null {
  if (model.provider === "custom") return null;
  return beginRecentBySlug(modelSlug(model.modelId), mode, activity);
}

export function beginRecentBySlug(slug: string, mode?: Mode, activity: Activity = "chat"): RecentHandle | null {
  const db = getRtdb();
  if (!db) return null;
  const t = serverNow();
  const slot = Math.floor(t / 1000) % 60;
  const entry: RecentRequest = { m: slug, t, s: "run", a: activity };
  if (mode) entry.mode = mode;
  set(ref(db, `stats/recent/${slot}`), entry).catch(() => {});
  return { slot, t, entry };
}

/** Change what a still-running request says it is doing (e.g. chat -> coding once a code
 * block starts streaming). Only touches our own entry. */
export function setRecentActivity(handle: RecentHandle | null | undefined, activity: Activity): void {
  const db = getRtdb();
  if (!db || !handle) return;
  handle.entry = { ...handle.entry, a: activity };
  runTransaction(ref(db, `stats/recent/${handle.slot}`), (cur: RecentRequest | null) => {
    if (cur === null) return handle.entry;
    return cur.t === handle.t && cur.s !== "done" ? { ...cur, a: activity } : undefined;
  }).catch(() => {});
}

function finishRecentRequest(event: {
  slug: string;
  tokens?: number;
  mode?: Mode | "image" | "speech";
  handle?: RecentHandle | null;
  activity?: Activity;
}): void {
  const db = getRtdb();
  if (!db) return;
  const tokens = Math.round(event.tokens ?? 0);
  const patch = (base: RecentRequest): RecentRequest => {
    const next: RecentRequest = { ...base, s: "done" };
    if (event.activity) next.a = event.activity;
    if (tokens > 0) next.k = tokens;
    return next;
  };
  const h = event.handle;
  if (h) {
    // Only complete our own entry — if the ring has wrapped and the slot now belongs to a
    // newer request, leave it alone.
    runTransaction(ref(db, `stats/recent/${h.slot}`), (cur: RecentRequest | null) => {
      if (cur === null) return patch(h.entry);
      return cur.t === h.t ? patch(cur) : undefined;
    }).catch(() => {});
    return;
  }
  const t = serverNow();
  const entry: RecentRequest = { m: event.slug, t };
  if (event.mode) entry.mode = event.mode;
  set(ref(db, `stats/recent/${Math.floor(t / 1000) % 60}`), patch(entry)).catch(() => {});
}

/**
 * All-time totals behind the public /status page, kept under stats/ in the Realtime
 * Database. Each event is ONE multi-path update of server-side increments, so concurrent
 * writers never race and the page's onValue listener ticks up live. Still anonymous: no
 * uid, no chat content — counters only. Custom-provider models never reach here.
 *
 *   stats/totals/{chats,replies,tokens}      all-time
 *   stats/models/{slug}/{replies,tokens}     all-time, per model
 *   stats/modes/{mode}/replies               all-time, per mode
 *   stats/daily/{YYYY-MM-DD}/{chats,replies,tokens}   days roll over at midnight Central time
 *
 * Needs RTDB rules that allow public read and bounded increments on "stats" (see
 * database.rules.json). If they aren't deployed the write fails silently, like modelStats.
 */
function recordSiteTotals(event: { slug?: string; tokens?: number; mode?: Mode | "image" | "speech"; chats?: number }): void {
  const db = getRtdb();
  if (!db) return;
  const day = centralDayKey(new Date(serverNow()));
  const tokens = Math.max(0, Math.round(event.tokens ?? 0));
  const updates: Record<string, ReturnType<typeof increment>> = {};
  if (event.chats) {
    updates["totals/chats"] = increment(event.chats);
    updates[`daily/${day}/chats`] = increment(event.chats);
  }
  if (event.slug) {
    updates["totals/replies"] = increment(1);
    updates[`daily/${day}/replies`] = increment(1);
    updates[`models/${event.slug}/replies`] = increment(1);
    if (event.mode) updates[`modes/${event.mode}/replies`] = increment(1);
    if (tokens > 0) {
      updates["totals/tokens"] = increment(tokens);
      updates[`daily/${day}/tokens`] = increment(tokens);
      updates[`models/${event.slug}/tokens`] = increment(tokens);
    }
  }
  if (Object.keys(updates).length === 0) return;
  update(ref(db, "stats"), updates).catch(() => {});
}

/** A chat just got its first message — i.e. a new chat was actually saved, not an empty draft. */
export function recordChatSaved(): void {
  recordSiteTotals({ chats: 1 });
}

export type MonthStats = Record<string, number>; // modelSlug -> completed-reply count

/** One-shot read of a month's counters. Returns null on any failure (offline, rules not
 * set up yet, database not provisioned) so callers can tell "no data" from "not set up". */
export async function fetchMonthStats(month: string): Promise<MonthStats | null> {
  const db = getRtdb();
  if (!db) return null;
  try {
    const snap = await dbGet(ref(db, `modelStats/${month}`));
    return snap.exists() ? (snap.val() as MonthStats) : {};
  } catch {
    return null;
  }
}
