/**
 * Realtime Database persistence for the Tutor page.
 *
 * The tutor's corpus is the one thing in this app a user genuinely can't
 * reconstruct — their own writing, plus a profile derived from it — and it's also
 * the heaviest (image thumbnails, long samples). So it lives in RTDB rather than
 * localStorage: no ~5MB quota to prune around, and it follows the account across
 * devices like chats do.
 *
 * Same shape as lib/cloudSync.ts: the whole blob round-trips as one JSON string at
 * `users/{uid}/tutorJson`, so there's no separate RTDB data model to keep in step
 * with the local one, and the existing `users/{uid}` security rule already covers it.
 *
 * Merging is per-collection rather than whole-blob, because the parts have different
 * failure modes:
 *   - samples union by id, minus tombstones — losing writing someone pasted in is
 *     the worst outcome here, and a tombstone list means a real deletion still sticks.
 *   - profile: whichever was built more recently wins.
 *   - messages: whole-list last-write-wins on `updatedAt`, so "Clear chat" on one
 *     device isn't undone by a union with a stale remote copy.
 */
import { get as dbGet, onValue, ref, set as dbSet } from "firebase/database";
import { getRtdb } from "./firebase";
import type { StyleProfile, TutorMessage, WritingSample } from "./tutorStore";

export interface TutorBlob {
  samples: WritingSample[];
  profile: StyleProfile | null;
  messages: TutorMessage[];
  /** Ids of samples deleted on some device, so a merge doesn't resurrect them. */
  deletedSampleIds: string[];
  updatedAt: number;
}

export function emptyBlob(): TutorBlob {
  return { samples: [], profile: null, messages: [], deletedSampleIds: [], updatedAt: 0 };
}

export function mergeTutor(local: TutorBlob, remote: TutorBlob): TutorBlob {
  const deletedSampleIds = Array.from(new Set([...local.deletedSampleIds, ...remote.deletedSampleIds]));
  const deleted = new Set(deletedSampleIds);

  const byId = new Map<string, WritingSample>();
  for (const s of [...remote.samples, ...local.samples]) {
    if (deleted.has(s.id)) continue;
    byId.set(s.id, s); // local wins on id collision — it's the copy the user is looking at
  }
  const samples = Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt);

  const profile =
    (local.profile?.createdAt ?? -1) >= (remote.profile?.createdAt ?? -1) ? local.profile : remote.profile;

  const newer = local.updatedAt >= remote.updatedAt ? local : remote;

  return {
    samples,
    profile,
    messages: newer.messages,
    deletedSampleIds,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  };
}

let activeUid: string | null = null;
let unsubscribe: (() => void) | null = null;
let lastJson: string | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Called on sign-in. Pulls what's in the cloud, merges it with whatever this tab
 * already holds (work done before signing in, or data migrated off the old
 * localStorage key), applies the result, pushes it back up, then listens for
 * changes from other devices.
 *
 * Every RTDB entry point is wrapped: if the database isn't provisioned, the rules
 * reject, or the network is down, the tutor keeps working in memory for this
 * session instead of throwing.
 */
export async function startTutorSync(
  uid: string,
  getBlob: () => TutorBlob,
  apply: (blob: TutorBlob, state: "synced" | "error") => void,
  onFirstPush: () => void
): Promise<void> {
  activeUid = uid;

  const db = getRtdb();
  if (!db) {
    apply(getBlob(), "error");
    return;
  }
  const node = ref(db, `users/${uid}/tutorJson`);

  let merged: TutorBlob;
  try {
    const snap = await dbGet(node);
    if (activeUid !== uid) return; // signed out again before this resolved
    const remote: TutorBlob = snap.exists() ? normalize(JSON.parse(snap.val() as string)) : emptyBlob();
    merged = mergeTutor(getBlob(), remote);
    lastJson = JSON.stringify(merged);
    apply(merged, "synced");
    await dbSet(node, lastJson);
    onFirstPush();
  } catch {
    apply(getBlob(), "error");
    return;
  }

  try {
    unsubscribe = onValue(
      node,
      (snap) => {
        if (activeUid !== uid || !snap.exists()) return;
        const json = snap.val() as string;
        if (json === lastJson) return; // our own write echoing back
        try {
          const next = mergeTutor(getBlob(), normalize(JSON.parse(json)));
          lastJson = JSON.stringify(next);
          apply(next, "synced");
        } catch {
          // malformed remote payload — keep what's on screen
        }
      },
      () => {
        // listen canceled (permission/connectivity) — stay in-memory for this session
      }
    );
  } catch {
    // onValue threw synchronously — stay in-memory
  }
}

export function stopTutorSync(): void {
  activeUid = null;
  unsubscribe?.();
  unsubscribe = null;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  lastJson = null;
}

/** Debounced write, held back while a reply is streaming so tokens don't hammer RTDB. */
export function pushTutorToCloud(blob: TutorBlob): void {
  if (!activeUid) return;
  const db = getRtdb();
  if (!db) return;
  if (blob.messages.some((m) => m.streaming)) return;
  const json = JSON.stringify(blob);
  if (json === lastJson) return;
  const uid = activeUid;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (activeUid !== uid) return; // signed out (or switched accounts) before this fired
    lastJson = json;
    dbSet(ref(db, `users/${uid}/tutorJson`), json).catch(() => {});
  }, 2000);
}

/** Fills in fields a blob written by an older build won't have. */
function normalize(raw: unknown): TutorBlob {
  const b = (raw ?? {}) as Partial<TutorBlob>;
  return {
    samples: (b.samples ?? []).map((s) => ({ ...s, transcribing: false })),
    profile: b.profile ?? null,
    // A reply mid-stream when the tab closed can never resume — land it as an error
    // rather than a bubble that spins forever.
    messages: (b.messages ?? []).map((m) =>
      m.streaming ? { ...m, streaming: false, error: m.error ?? "Interrupted — the page was closed mid-reply." } : m
    ),
    deletedSampleIds: b.deletedSampleIds ?? [],
    updatedAt: b.updatedAt ?? 0,
  };
}

/**
 * One-time migration off the localStorage key the first version of this page used.
 * Read on boot so nobody's samples are stranded by the move to RTDB; the key is only
 * removed once the data has actually landed in the cloud (see `clearLegacyLocal`),
 * so a user who never signs in doesn't lose it either.
 */
const LEGACY_KEY = "scribble:tutor:v1";

export function readLegacyLocal(): TutorBlob | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const blob = normalize(JSON.parse(raw));
    return { ...blob, updatedAt: blob.updatedAt || Date.now() };
  } catch {
    return null;
  }
}

export function clearLegacyLocal(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // storage unavailable (private mode) — nothing to clean up
  }
}
