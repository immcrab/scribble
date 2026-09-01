import { create } from "zustand";
import { get as dbGet, onValue, ref, runTransaction, set as dbSet } from "firebase/database";
import { getRtdb, auth } from "./firebase";
import { usageConfig } from "./catalogSync";
import { modelSlug } from "./modelSlug";
import { modelKey, DEFAULT_MODEL_ID } from "../config/models";
import { isLocalDev } from "./devMode";
import type { ModelDef, UsageRecord } from "../types";

/**
 * Per-user daily credit limit. 1 credit ≈ 1 token (prompt + reply, estimated). Every signed-in
 * user gets `usageConfig().dailyCredits` (default 1,000,000) per UTC day; once they're spent,
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

/* ── Non-chat generators: image & text-to-speech ──────────────────────────────
 * Image and speech runs burn from the same daily credit pool as chat. Each has a
 * flat-ish base cost below; like chat models, the admin can scale each one with a
 * multiplier stored in usageConfig().modelCredits under the synthetic keys in
 * MEDIA_KEYS (edited on Admin → Limits).
 */

/** Billing bucket for one image. Not the same thing as the wire provider in
 * config/imageModels.ts — two models on the same provider can cost wildly
 * different amounts upstream (xKiro's SenseNova has a free tier, GPT Image
 * does not), so each gets its own bucket. */
export type ImageBilling = "cloudflare" | "xkiro" | "xkiro-free";

/** Credits for one generated image, before the admin multiplier. Flux on Cloudflare
 * Workers AI is cheap; GPT Image (xKiro) costs far more upstream. */
export const IMAGE_BASE_CREDITS: Record<ImageBilling, number> = {
  cloudflare: 1_500,
  xkiro: 25_000,
  "xkiro-free": 1_500,
};

/** Speech cost = words × PER_WORD + seconds × PER_SECOND, before the multiplier.
 * Every voice bills the same — only length matters. */
export const SPEECH_CREDITS_PER_WORD = 40;
export const SPEECH_CREDITS_PER_SECOND = 120;

/** usageConfig().modelCredits keys for the media generators (not real "{provider}:{modelId}"
 * pairs, just stable strings the admin multiplier map is filed under). */
export const MEDIA_KEYS = {
  imageCloudflare: "image:cloudflare",
  imageXkiro: "image:xkiro",
  imageXkiroFree: "image:xkiro-free",
  speech: "speech:xkiro",
} as const;

/** Billing bucket → the MEDIA_KEYS entry its cost and multiplier live under. */
export const IMAGE_BILLING_KEYS: Record<ImageBilling, string> = {
  cloudflare: MEDIA_KEYS.imageCloudflare,
  xkiro: MEDIA_KEYS.imageXkiro,
  "xkiro-free": MEDIA_KEYS.imageXkiroFree,
};

/** MEDIA_KEYS value → the slug its spend is filed under in UsageRecord.models. */
export const MEDIA_SLUGS: Record<string, string> = {
  [MEDIA_KEYS.imageCloudflare]: "image-cloudflare",
  [MEDIA_KEYS.imageXkiro]: "image-xkiro",
  [MEDIA_KEYS.imageXkiroFree]: "image-xkiro-free",
  [MEDIA_KEYS.speech]: "speech-xkiro",
};

/** Slug (as stored in UsageRecord.models) → friendly label for the Usage page. */
export const MEDIA_LABELS: Record<string, string> = {
  "image-cloudflare": "Cloudflare Flux · image",
  "image-xkiro": "GPT Image",
  "image-xkiro-free": "SenseNova U1.5 Lite",
  "speech-xkiro": "Text to speech",
};

/** Admin multiplier (default 1) for one of the MEDIA_KEYS. */
export function mediaMultiplier(key: string): number {
  const v = usageConfig().modelCredits[key];
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
    overLimit: !isLocalDev() && used >= limit,
    blocked: !isLocalDev() && !!uid && cfg.blockedUids.includes(uid),
    byModel,
    resetsAt: nextResetAt(),
  };
}

/** Whether the signed-in user may run `model` right now. Anonymous users always pass here —
 * their gating is `isModelGated` in config/models.ts. */
export function usageGate(model: Pick<ModelDef, "provider" | "modelId" | "displayName">): { ok: true } | { ok: false; reason: string } {
  if (isLocalDev()) return { ok: true };
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
  const cost = Math.round(tokens * creditMultiplier(model));
  bumpUsage(uid, modelSlug(model.modelId), cost);
}

/** Charge one completed image generation to today's tally. No-op for anonymous users. */
export function recordImageUsage(billing: ImageBilling): void {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const key = IMAGE_BILLING_KEYS[billing] ?? MEDIA_KEYS.imageCloudflare;
  const cost = Math.round(IMAGE_BASE_CREDITS[billing] * mediaMultiplier(key));
  bumpUsage(uid, MEDIA_SLUGS[key], cost);
}

/** Charge one completed text-to-speech run — `words` of input, `seconds` of audio produced. */
export function recordSpeechUsage(words: number, seconds: number): void {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const raw = Math.max(0, words) * SPEECH_CREDITS_PER_WORD + Math.max(0, seconds) * SPEECH_CREDITS_PER_SECOND;
  const cost = Math.round(raw * mediaMultiplier(MEDIA_KEYS.speech));
  bumpUsage(uid, MEDIA_SLUGS[MEDIA_KEYS.speech], cost);
}

/** Shared write path for every credit sink: add `cost` to today's total and to `slug`'s row.
 * Best-effort — no-op when RTDB is unreachable, never throws. */
function bumpUsage(uid: string, slug: string, cost: number): void {
  if (cost <= 0) return;
  const db = getRtdb();
  if (!db) return;
  const day = todayUTC();
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

/** Whether the signed-in user may start an image / speech generation right now. Anonymous
 * users pass here — the modes gate them with their own sign-in check. Mirrors `usageGate`. */
export function mediaUsageGate(kind: "image" | "speech"): { ok: true } | { ok: false; reason: string } {
  if (isLocalDev()) return { ok: true };
  const uid = auth.currentUser?.uid;
  if (!uid) return { ok: true };

  const cfg = usageConfig();
  if (cfg.blockedUids.includes(uid)) {
    return { ok: false, reason: `This account is limited to the free default chat model. Contact the admin to lift it.` };
  }

  const st = creditStatus();
  if (!st.overLimit) return { ok: true };

  const resets = new Date(st.resetsAt).toLocaleString(undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
  const label = kind === "image" ? "Image generation" : "Text to speech";
  return {
    ok: false,
    reason: `Daily credit limit reached (${st.limit.toLocaleString()}). ${label} unlocks again at ${resets} — see the Usage page.`,
  };
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
