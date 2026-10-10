import { get as dbGet, increment, ref, runTransaction, update } from "firebase/database";
import { getRtdb } from "./firebase";
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

export function monthKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function recordModelUsage(
  model: Pick<ModelDef, "modelId" | "provider">,
  extra: { tokens?: number; mode?: Mode } = {}
): void {
  if (model.provider === "custom") return;
  const db = getRtdb();
  if (!db) return;
  const slug = modelSlug(model.modelId);
  const counterRef = ref(db, `modelStats/${monthKey()}/${slug}`);
  runTransaction(counterRef, (current: number | null) => (current ?? 0) + 1).catch(() => {});
  recordSiteTotals({ slug, tokens: extra.tokens, mode: extra.mode });
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
 *   stats/daily/{YYYY-MM-DD}/{chats,replies,tokens}
 *
 * Needs RTDB rules that allow public read and bounded increments on "stats" (see
 * database.rules.json). If they aren't deployed the write fails silently, like modelStats.
 */
function dayKey(date: Date = new Date()): string {
  return `${monthKey(date)}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function recordSiteTotals(event: { slug?: string; tokens?: number; mode?: Mode; chats?: number }): void {
  const db = getRtdb();
  if (!db) return;
  const day = dayKey();
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
