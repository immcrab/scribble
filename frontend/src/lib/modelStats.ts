import { get as dbGet, ref, runTransaction } from "firebase/database";
import { getRtdb } from "./firebase";
import { modelSlug } from "./modelSlug";
import type { ModelDef } from "../types";

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

export function recordModelUsage(model: Pick<ModelDef, "modelId" | "provider">): void {
  if (model.provider === "custom") return;
  const db = getRtdb();
  if (!db) return;
  const slug = modelSlug(model.modelId);
  const counterRef = ref(db, `modelStats/${monthKey()}/${slug}`);
  runTransaction(counterRef, (current: number | null) => (current ?? 0) + 1).catch(() => {});
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
