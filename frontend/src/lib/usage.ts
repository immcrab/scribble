import { create } from "zustand";
import { get as dbGet, onValue, ref, runTransaction, set as dbSet } from "firebase/database";
import { getRtdb, auth } from "./firebase";
import { usageConfig } from "./catalogSync";
import { modelSlug } from "./modelSlug";
import { modelKey, DEFAULT_MODEL_ID } from "../config/models";
import type { ModelDef, UsageRecord } from "../types";

/**
 * Per-user daily credit limit. 1 credit ≈ 1 token (prompt + reply, estimated). Every signed-in
 * user gets `usageConfig().dailyCredits` (default 2,000,000) per UTC day; once they're spent,
 * only the free default model plus the admin's `postLimitKeys` list stay usable until 00:00 UTC.
 *
 * Enforcement is client-side — the same honour-system model as sign-in gating (config/models.ts's
 * `isModelGated`) and the shared catalog. The counts live at RTDB `usage/{uid}` so they survive
 * across devices and the admin can see them; see lib/catalogSync.ts for the required RTDB rule.
 *
 * Anonymous visitors aren't tracked at all — they can only reach the default model anyway.
 */

export function todayUTC(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Epoch ms of the next 00:00 UTC — when the current day's credits reset. */
export function nextResetAt(now: Date = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

function isDefaultModel(m: Pick<ModelDef, "provider" | "modelId">): boolean {
  return m.provider === "xkiro" && m.modelId === DEFAULT_MODEL_ID;
}

/** Admin-set cost multiplier for a model (default 1). Custom-provider models are never counted. */
export function creditMultiplier(m: Pick<ModelDef, "provider" | "modelId">): number {
  if (m.provider === "custom") return 0;
  const v = usageConfig().modelCredits[modelKey(m)];
  return typeof v === "number" && v >= 0 ? v : 1;
}

interface UsageStore {
  /** null until the first RTDB read resolves (or when signed out). */
  record: UsageRecord | null;
  loaded: boolean;
  setRecord: (r: UsageRecord | null, loaded: boolean) => void;
}

export const useUsageStore = create<UsageStore>((set) => ({
  record: null,
  loaded: false,
  setRecord: (record, loaded) => set({ record, loaded }),
}));

/** The record for *today* — a stored record from an earlier day counts as zero. */
function todaysRecord(): UsageRecord | null {
  const r = useUsageStore.getState().record;
  return r && r.day === todayUTC() ? r : null;
}

export interface CreditStatus {
  used: number;
  /** dailyCredits + any bonus granted for today. */
  limit: number;
  remaining: number;
  /** 0–1. */
  fraction: number;
  overLimit: boolean;
  blocked: boolean;
  /** modelSlug → credits spent today, highest first. */
  byModel: Array<{ slug: string; credits: number }>;
  resetsAt: number;
}

export function creditStatus(): CreditStatus {
  const cfg = usageConfig();
  const uid = auth.currentUser?.uid ?? null;
  const rec = todaysRecord();
  const used = rec?.credits ?? 0;

  const bonus = uid && cfg.bonus[uid]?.day === todayUTC() ? cfg.bonus[uid].credits : 0;
  const limit = Math.max(0, cfg.dailyCredits + bonus);
  const remaining = Math.max(0, limit - used);
  const byModel = Object.entries(rec?.models ?? {})
    .map(([slug, credits]) => ({ slug, credits }))
    .sort((a, b) => b.credits - a.credits);

  return {
    used,
    limit,
    remaining,
    fraction: limit > 0 ? Math.min(1, used / limit) : 1,
    overLimit: used >= limit,
    blocked: !!uid && cfg.blockedUids.includes(uid),
    byModel,
    resetsAt: nextResetAt(),
  };
}

/** Whether the signed-in user may run `model` right now. Anonymous users always pass here —
 * their gating is `isModelGated` in config/models.ts. */
export function usageGate(model: Pick<ModelDef, "provider" | "modelId" | "displayName">): { ok: true } | { ok: false; reason: string } {
  const uid = auth.currentUser?.uid;
  if (!uid) return { ok: true };
  if (isDefaultModel(model)) return { ok: true };

  const cfg = usageConfig();
  if (cfg.blockedUids.includes(uid)) {
    return { ok: false, reason: `This account is limited to the free default model. Contact the admin to lift it.` };
  }

  const st = creditStatus();
  if (!st.overLimit) return { ok: true };
  if (cfg.postLimitKeys.includes(modelKey(model))) return { ok: true };

  const resets = new Date(st.resetsAt).toLocaleString(undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
  return {
    ok: false,
    reason: `Daily credit limit reached (${st.limit.toLocaleString()}). ${model.displayName} unlocks again at ${resets}. Until then, only the free default model and a few selected models are available — see the Usage page.`,
  };
}

/**
 * Add `tokens × multiplier` credits to today's tally. Called once per completed reply
 * (see lib/runStream.ts). No-op for anonymous users, custom providers, or when RTDB is
 * unreachable — usage tracking is best-effort, never blocks a chat.
 */
export function recordCreditUsage(model: Pick<ModelDef, "provider" | "modelId">, tokens: number): void {
  const uid = auth.currentUser?.uid;
  if (!uid || tokens <= 0) return;
  const mult = creditMultiplier(model);
  const cost = Math.round(tokens * mult);
  if (cost <= 0) return;

  const db = getRtdb();
  if (!db) return;
  const day = todayUTC();
  const slug = modelSlug(model.modelId);
  const email = auth.currentUser?.email ?? null;

  runTransaction(ref(db, `usage/${uid}`), (cur: UsageRecord | null) => {
    const fresh = !cur || cur.day !== day;
    const base: UsageRecord = fresh
      ? { day, credits: 0, models: {}, email, updatedAt: 0 }
      : { ...cur, models: { ...cur.models } };
    base.day = day;
    base.credits += cost;
    base.models[slug] = (base.models[slug] ?? 0) + cost;
    base.email = email ?? base.email ?? null;
    base.updatedAt = Date.now();
    return base;
  }).catch(() => {});
}

let stopSub: (() => void) | null = null;
let activeUid: string | null = null;

/** Subscribe to `usage/{uid}` and keep `useUsageStore` in sync. Called on sign-in (authStore). */
export function startUsageSync(uid: string): void {
  if (activeUid === uid) return;
  stopUsageSync();
  activeUid = uid;
  const db = getRtdb();
  if (!db) {
    useUsageStore.getState().setRecord(null, true);
    return;
  }
  try {
    const unsub = onValue(
      ref(db, `usage/${uid}`),
      (snap) => {
        if (activeUid !== uid) return;
        const val = snap.exists() ? (snap.val() as UsageRecord) : null;
        useUsageStore.getState().setRecord(val, true);
      },
      () => useUsageStore.getState().setRecord(null, true)
    );
    stopSub = unsub;
  } catch {
    useUsageStore.getState().setRecord(null, true);
  }
}

export function stopUsageSync(): void {
  activeUid = null;
  stopSub?.();
  stopSub = null;
  useUsageStore.getState().setRecord(null, false);
}

/** One-shot read of every user's usage record — for the admin Users tab. Keyed by uid. */
export async function fetchAllUsage(): Promise<Record<string, UsageRecord> | null> {
  const db = getRtdb();
  if (!db) return null;
  try {
    const snap = await dbGet(ref(db, "usage"));
    return snap.exists() ? (snap.val() as Record<string, UsageRecord>) : {};
  } catch {
    return null;
  }
}

/** Admin-only: zero out one user's usage for today. Needs the admin `.write` clause on
 * `usage/$uid` (see lib/catalogSync.ts). */
export async function resetUserUsage(uid: string, email: string | null): Promise<void> {
  const db = getRtdb();
  if (!db) throw new Error("Database unavailable.");
  const empty: UsageRecord = { day: todayUTC(), credits: 0, models: {}, email: email ?? null, updatedAt: Date.now() };
  await dbSet(ref(db, `usage/${uid}`), empty);
}
