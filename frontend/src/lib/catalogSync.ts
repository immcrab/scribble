import { create } from "zustand";
import { onValue, ref, set as dbSet } from "firebase/database";
import { getRtdb } from "./firebase";
import { setAdminCatalog } from "../config/models";
import type { AdminCatalog, ModelDef } from "../types";

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
 */

const CATALOG_KEY = "scribble:catalog";
const CATALOG_PATH = "catalog/v1";

export const EMPTY_CATALOG: AdminCatalog = { added: [], hiddenKeys: [], updatedAt: 0 };

function sanitize(raw: unknown): AdminCatalog {
  const c = (raw ?? {}) as Partial<AdminCatalog>;
  return {
    added: Array.isArray(c.added) ? (c.added.filter((m) => m && typeof m === "object") as ModelDef[]) : [],
    hiddenKeys: Array.isArray(c.hiddenKeys) ? c.hiddenKeys.filter((k): k is string => typeof k === "string") : [],
    updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : 0,
  };
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
