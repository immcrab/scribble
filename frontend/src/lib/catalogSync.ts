import { create } from "zustand";
import { onValue, ref, set as dbSet } from "firebase/database";
import { getRtdb } from "./firebase";
import { setAdminCatalog } from "../config/models";
import type { AdminCatalog, ModelDef, UsageConfig, WatermarkConfig } from "../types";

/**
 * The shared, admin-curated model catalog overlay. One global RTDB node,
 * `catalog/v1`, holds a JSON string (same "stringified blob" shape as
 * users/{uid}/chatsJson in cloudSync.ts). It's world-readable — every visitor,
 * signed in or not, subscribes on load — and writable only by the admin account
 * (enforced by the RTDB rule, not this file). Editing happens in pages/AdminPage.tsx.
 *
 * Required RTDB rule (Firebase console → Realtime Database → Rules):
 *
 *   "catalog": {
 *     ".read": true,
 *     ".write": "auth != null && auth.token.email === 'imcrabfr@gmail.com' && auth.token.email_verified === true"
 *   }
 *
 * The daily usage limit (lib/usage.ts) also needs a rule on the per-user `usage` node:
 *
 *   "usage": {
 *     ".read": "auth != null && auth.token.email === 'imcrabfr@gmail.com' && auth.token.email_verified === true",
 *     "$uid": {
 *       ".read": "auth != null && auth.uid === $uid",
 *       ".write": "auth != null && (auth.uid === $uid || (auth.token.email === 'imcrabfr@gmail.com' && auth.token.email_verified === true))"
 *     }
 *   }
 *
 * (The admin write on `usage/$uid` is only used by the "Reset usage" button on the Users tab.)
 */

const CATALOG_KEY = "scribble:catalog";
const CATALOG_PATH = "catalog/v1";

/** The out-of-the-box usage limit: 1,000,000 credits/token-equivalents per UTC day, every
 * model costs 1×, nothing extra usable once you're over, nobody blocked. */
export const DEFAULT_USAGE: UsageConfig = {
  dailyCredits: 1_000_000,
  postLimitKeys: [],
  modelCredits: {},
  blockedUids: [],
  bonus: {},
};

/** The out-of-the-box watermark: on, "ScribbleAI", 55% opacity, ~2.8% of image width. */
export const DEFAULT_WATERMARK: WatermarkConfig = {
  enabled: true,
  text: "ScribbleAI",
  opacity: 0.55,
  scale: 0.028,
};

export const EMPTY_CATALOG: AdminCatalog = {
  added: [],
  hiddenKeys: [],
  usage: DEFAULT_USAGE,
  watermark: DEFAULT_WATERMARK,
  updatedAt: 0,
};

function sanitizeWatermark(raw: unknown): WatermarkConfig {
  const w = (raw ?? {}) as Partial<WatermarkConfig>;
  const clamp = (n: unknown, lo: number, hi: number, fallback: number) =>
    typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  const text = typeof w.text === "string" ? w.text.slice(0, 40) : DEFAULT_WATERMARK.text;
  return {
    enabled: typeof w.enabled === "boolean" ? w.enabled : DEFAULT_WATERMARK.enabled,
    text: text.trim() || DEFAULT_WATERMARK.text,
    opacity: clamp(w.opacity, 0, 1, DEFAULT_WATERMARK.opacity),
    scale: clamp(w.scale, 0.005, 0.15, DEFAULT_WATERMARK.scale),
  };
}

function sanitizeUsage(raw: unknown): UsageConfig {
  const u = (raw ?? {}) as Partial<UsageConfig>;
  const credits = typeof u.dailyCredits === "number" && u.dailyCredits >= 0 ? Math.floor(u.dailyCredits) : DEFAULT_USAGE.dailyCredits;
  const modelCredits: Record<string, number> = {};
  if (u.modelCredits && typeof u.modelCredits === "object") {
    for (const [k, v] of Object.entries(u.modelCredits)) {
      if (typeof v === "number" && v >= 0 && v !== 1) modelCredits[k] = v;
    }
  }
  const bonus: Record<string, { day: string; credits: number }> = {};
  if (u.bonus && typeof u.bonus === "object") {
    for (const [k, v] of Object.entries(u.bonus)) {
      if (v && typeof v === "object" && typeof (v as { day?: unknown }).day === "string" && typeof (v as { credits?: unknown }).credits === "number") {
        bonus[k] = { day: (v as { day: string }).day, credits: Math.floor((v as { credits: number }).credits) };
      }
    }
  }
  return {
    dailyCredits: credits,
    postLimitKeys: Array.isArray(u.postLimitKeys) ? u.postLimitKeys.filter((k): k is string => typeof k === "string") : [],
    modelCredits,
    blockedUids: Array.isArray(u.blockedUids) ? u.blockedUids.filter((k): k is string => typeof k === "string") : [],
    bonus,
  };
}

function sanitize(raw: unknown): AdminCatalog {
  const c = (raw ?? {}) as Partial<AdminCatalog>;
  return {
    added: Array.isArray(c.added) ? (c.added.filter((m) => m && typeof m === "object") as ModelDef[]) : [],
    hiddenKeys: Array.isArray(c.hiddenKeys) ? c.hiddenKeys.filter((k): k is string => typeof k === "string") : [],
    usage: sanitizeUsage(c.usage),
    watermark: sanitizeWatermark(c.watermark),
    updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : 0,
  };
}

/** The active usage config — always fully populated (defaults fill any gap). Read by lib/usage.ts. */
export function usageConfig(): UsageConfig {
  return useCatalogStore.getState().catalog.usage ?? DEFAULT_USAGE;
}

/** The active watermark config — always fully populated. Read by modes/ImageMode.tsx. */
export function watermarkConfig(): WatermarkConfig {
  return useCatalogStore.getState().catalog.watermark ?? DEFAULT_WATERMARK;
}

function loadCache(): AdminCatalog {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (!raw) return EMPTY_CATALOG;
    return sanitize(JSON.parse(raw));
  } catch {
    return EMPTY_CATALOG;
  }
}

function saveCache(c: AdminCatalog): void {
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(c));
  } catch {
    // storage unavailable — the live subscription re-fills it next load
  }
}

interface CatalogStore {
  catalog: AdminCatalog;
  /** Replace the in-memory catalog, push it into config/models.ts, and cache it. Does NOT
   * write to RTDB — use `publishCatalog` for that. */
  applyCatalog: (c: AdminCatalog) => void;
}

export const useCatalogStore = create<CatalogStore>((set) => ({
  catalog: (() => {
    const cached = loadCache();
    setAdminCatalog(cached.added, cached.hiddenKeys);
    return cached;
  })(),
  applyCatalog: (c) => {
    const clean = sanitize(c);
    setAdminCatalog(clean.added, clean.hiddenKeys);
    saveCache(clean);
    set({ catalog: clean });
  },
}));

let started = false;

/** Called once on app start (main.tsx). Subscribes to the global catalog node and keeps
 * the store / config in sync with whatever the admin last published. Safe to call when the
 * database isn't reachable — the cached copy just stays in effect. */
export function initCatalogSync(): void {
  if (started) return;
  started = true;
  const db = getRtdb();
  if (!db) return;
  try {
    onValue(
      ref(db, CATALOG_PATH),
      (snap) => {
        if (!snap.exists()) return;
        try {
          const parsed = typeof snap.val() === "string" ? JSON.parse(snap.val() as string) : snap.val();
          useCatalogStore.getState().applyCatalog(parsed as AdminCatalog);
        } catch {
          // malformed payload — keep the last good catalog
        }
      },
      () => {
        // listen canceled (offline / rules) — stay on the cached catalog
      }
    );
  } catch {
    // onValue threw synchronously — cached catalog stays in effect
  }
}

/**
 * Writes the catalog to RTDB (admin only). Applies the change locally right away so the
 * admin UI is responsive, then pushes to RTDB; if that write is refused (e.g. the
 * `catalog` RTDB rule isn't in place yet) the local change is rolled back and the error
 * re-thrown so the caller can surface it — nothing silently "sticks" in one browser while
 * looking global.
 */
export async function publishCatalog(next: Omit<AdminCatalog, "updatedAt">): Promise<void> {
  const clean = sanitize({ ...next, updatedAt: Date.now() });
  const prev = useCatalogStore.getState().catalog;
  useCatalogStore.getState().applyCatalog(clean);
  const db = getRtdb();
  if (!db) {
    useCatalogStore.getState().applyCatalog(prev);
    throw new Error("Database unavailable — can't publish catalog changes right now.");
  }
  try {
    await dbSet(ref(db, CATALOG_PATH), JSON.stringify(clean));
  } catch (e) {
    useCatalogStore.getState().applyCatalog(prev);
    throw e;
  }
}
