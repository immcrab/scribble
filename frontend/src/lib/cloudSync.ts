import { get as dbGet, onValue, ref, set as dbSet } from "firebase/database";
import { loadFirestore, getRtdb } from "./firebase";
import { normalizeSettings, saveChats, saveSettings, saveMemories, saveProjects, type LofinSettings } from "./storage";
import type { Chat, MemoryEntry, Project } from "../types";

/**
 * Cross-device continuity: chats and settings round-trip through the signed-in
 * user's Firestore document. Browser storage remains the immediate fallback,
 * so a deploy or temporary network outage cannot reset settings.
 *
 * Merging is last-write-wins *per chat* (by id, comparing updatedAt), so a
 * chat that only exists on one device always survives — logging in on a
 * second device unions histories instead of one clobbering the other.
 * Settings merge the same way as one whole-object comparison, except
 * `password`, `customProviders`, `customModels`, and `mcpServers` always stay local
 * (never round-tripped to the cloud) — the latter two carry the user's own
 * third-party API keys, which is exactly the kind of secret `password` was
 * already being excluded for.
 */

export function mergeChats(local: Chat[], remote: Chat[]): Chat[] {
  const byId = new Map<string, Chat>();
  for (const c of local) byId.set(c.id, c);
  for (const c of remote) {
    const existing = byId.get(c.id);
    if (!existing || c.updatedAt > existing.updatedAt) byId.set(c.id, c);
  }
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function mergeSettings(local: LofinSettings, remote: LofinSettings | null): LofinSettings {
  if (!remote) return local;
  const winner = remote.updatedAt > local.updatedAt ? remote : local;
  // Unlike ordinary preferences, a seen announcement is monotonic: losing an
  // id during a last-write-wins settings merge makes an old popup reappear.
  // Keep the union so an update from another device cannot resurrect it.
  const seenAnnouncementIds = [...new Set([
    ...(local.seenAnnouncementIds ?? []),
    ...(remote.seenAnnouncementIds ?? []),
  ])].slice(-100);
  // Credentials, custom-provider configuration, and private MCP endpoint lists never leave this browser.
  // Normalizing here preserves settings added by a newer app version when the
  // cloud document was saved by an older deployment.
  return normalizeSettings({
    ...winner,
    password: local.password,
    customProviders: local.customProviders,
    customModels: local.customModels,
    mcpServers: local.mcpServers,
    seenAnnouncementIds,
  });
}

/** Remove device-only secrets before settings are persisted to Firestore. */
function settingsJsonForCloud(settings: LofinSettings): string {
  const { password: _password, customProviders: _customProviders, customModels: _customModels, mcpServers: _mcpServers, ...safeSettings } = settings;
  return JSON.stringify(safeSettings);
}

/** Memories don't carry a per-entry `updatedAt` — they're append/delete, not edited in place —
 * so merging is a plain union by id (each device's own new entries just get added). A memory
 * deleted on one device while another device is offline can resurface on next sync; an
 * acceptable tradeoff given how low-stakes and easily re-deleted a stray memory entry is. */
export function mergeMemories(local: MemoryEntry[], remote: MemoryEntry[]): MemoryEntry[] {
  const byId = new Map<string, MemoryEntry>();
  for (const m of local) byId.set(m.id, m);
  for (const m of remote) if (!byId.has(m.id)) byId.set(m.id, m);
  return Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt);
}

/** Same last-write-wins-per-id merge as mergeChats — a project only on one device survives. */
export function mergeProjects(local: Project[], remote: Project[]): Project[] {
  const byId = new Map<string, Project>();
  for (const p of local) byId.set(p.id, p);
  for (const p of remote) {
    const existing = byId.get(p.id);
    if (!existing || p.updatedAt > existing.updatedAt) byId.set(p.id, p);
  }
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

let activeUid: string | null = null;
let unsubscribers: Array<() => void> = [];
let lastChatsJson: string | null = null;
let lastSettingsJson: string | null = null;
let lastMemoriesJson: string | null = null;
let lastProjectsJson: string | null = null;
let chatsPushTimer: ReturnType<typeof setTimeout> | null = null;
let settingsPushTimer: ReturnType<typeof setTimeout> | null = null;
// A settings change is applied locally before its debounced cloud write runs.
// Do not let an in-flight listener snapshot from another tab/device replace that
// newer local choice in this window. In particular, this prevents a switch from
// visibly snapping back to its previous value a moment after it is turned on.
// The flag is cleared only after Firebase confirms the write; if the write fails,
// local storage remains authoritative until a later successful settings save.
let hasPendingLocalSettingsWrite = false;
let settingsWriteRevision = 0;
let memoriesPushTimer: ReturnType<typeof setTimeout> | null = null;
let projectsPushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Called once on sign-in. Reads whatever's already in the cloud, merges it
 * with what's on this device, applies the merged result locally, pushes it
 * back up (covers the case where this device had data the cloud didn't),
 * then subscribes for live updates from other devices/tabs.
 *
 * Every Firebase entry point is wrapped defensively — if the relevant database
 * isn't actually provisioned for this Firebase project (or
 * the app is offline), sync silently doesn't happen instead of throwing;
 * local storage is the source of truth either way.
 */
export async function startCloudSync(
  uid: string,
  getState: () => { chats: Chat[]; settings: LofinSettings; memories: MemoryEntry[]; projects: Project[] },
  setState: (patch: { chats?: Chat[]; settings?: LofinSettings; memories?: MemoryEntry[]; projects?: Project[] }) => void
): Promise<void> {
  activeUid = uid;

  const fs = await loadFirestore();
  if (!fs || activeUid !== uid) return;
  const { doc, getDoc, setDoc, onSnapshot } = fs;
  const chatsRef = doc(fs.db, "users", uid);
  const db = getRtdb();
  const memoriesRef = db ? ref(db, `users/${uid}/memoriesJson`) : null;
  const projectsRef = db ? ref(db, `users/${uid}/projectsJson`) : null;

  try {
    const chatsSnap = await getDoc(chatsRef);
    if (activeUid !== uid) return; // signed out again before this resolved

    // One-time read fallback for accounts saved before chats moved to Firestore.
    // The merged payload below is written to Firestore, so later sessions no
    // longer read this RTDB value.
    const firestoreChatsJson = chatsSnap.exists() ? chatsSnap.data().chatsJson : null;
    const legacyChatsSnap = typeof firestoreChatsJson !== "string" && db
      ? await dbGet(ref(db, `users/${uid}/chatsJson`))
      : null;
    const chatsJson = typeof firestoreChatsJson === "string"
      ? firestoreChatsJson
      : legacyChatsSnap?.exists() ? legacyChatsSnap.val() : null;
    const remoteChats: Chat[] = typeof chatsJson === "string" ? JSON.parse(chatsJson) : [];
    // Read the legacy RTDB setting only when Firestore does not have one, then
    // immediately migrate the merged result below. This keeps existing account
    // settings without making RTDB a dependency for future deployments.
    const firestoreSettingsJson = chatsSnap.exists() ? chatsSnap.data().settingsJson : null;
    const legacySettingsSnap = typeof firestoreSettingsJson !== "string" && db
      ? await dbGet(ref(db, `users/${uid}/settingsJson`))
      : null;
    const [memoriesSnap, projectsSnap] = db && memoriesRef && projectsRef
      ? await Promise.all([dbGet(memoriesRef), dbGet(projectsRef)])
      : [null, null];
    const settingsJson = typeof firestoreSettingsJson === "string"
      ? firestoreSettingsJson
      : legacySettingsSnap?.exists() ? legacySettingsSnap.val() : null;
    const remoteSettings: LofinSettings | null = typeof settingsJson === "string" ? JSON.parse(settingsJson) : null;
    const remoteMemories: MemoryEntry[] = memoriesSnap?.exists() ? JSON.parse(memoriesSnap.val()) : [];
    const remoteProjects: Project[] = projectsSnap?.exists() ? JSON.parse(projectsSnap.val()) : [];

    const mergedChats = mergeChats(getState().chats, remoteChats);
    const mergedSettings = mergeSettings(getState().settings, remoteSettings);
    const mergedMemories = mergeMemories(getState().memories, remoteMemories);
    const mergedProjects = mergeProjects(getState().projects, remoteProjects);

    lastChatsJson = JSON.stringify(mergedChats);
    lastSettingsJson = settingsJsonForCloud(mergedSettings);
    lastMemoriesJson = JSON.stringify(mergedMemories);
    lastProjectsJson = JSON.stringify(mergedProjects);
    saveChats(mergedChats);
    saveSettings(mergedSettings);
    saveMemories(mergedMemories);
    saveProjects(mergedProjects);
    setState({ chats: mergedChats, settings: mergedSettings, memories: mergedMemories, projects: mergedProjects });

    setDoc(chatsRef, { chatsJson: lastChatsJson, settingsJson: lastSettingsJson }, { merge: true }).catch(() => {});
    if (db && memoriesRef && projectsRef) {
      dbSet(memoriesRef, lastMemoriesJson).catch(() => {});
      dbSet(projectsRef, lastProjectsJson).catch(() => {});
    }
  } catch {
    // Offline, permission-denied, database not provisioned, etc. — sync
    // just doesn't happen this session; local data still works.
    return;
  }

  try {
    const unsubChats = onSnapshot(
      chatsRef,
      (snap) => {
        if (activeUid !== uid || !snap.exists()) return;
        const json = snap.data().chatsJson;
        const settingsJson = snap.data().settingsJson;
        if (typeof json === "string" && json !== lastChatsJson) {
          try {
            const remoteChats: Chat[] = JSON.parse(json);
            const merged = mergeChats(getState().chats, remoteChats);
            lastChatsJson = JSON.stringify(merged);
            saveChats(merged);
            setState({ chats: merged });
          } catch {
            // malformed remote payload — ignore, keep local state
          }
        }
        if (typeof settingsJson !== "string" || settingsJson === lastSettingsJson || hasPendingLocalSettingsWrite) return;
        try {
          const remoteSettings: LofinSettings = JSON.parse(settingsJson);
          const merged = mergeSettings(getState().settings, remoteSettings);
          lastSettingsJson = settingsJsonForCloud(merged);
          saveSettings(merged);
          setState({ settings: merged });
        } catch {
          // malformed remote payload — ignore, keep local state
        }
      },
      () => {
        // listen canceled (permission/connectivity) — stay local-only
      }
    );

    const unsubMemories = db && memoriesRef ? onValue(
      memoriesRef,
      (snap) => {
        if (activeUid !== uid || !snap.exists()) return;
        const json = snap.val() as string;
        if (json === lastMemoriesJson) return;
        try {
          const remoteMemories: MemoryEntry[] = JSON.parse(json);
          const merged = mergeMemories(getState().memories, remoteMemories);
          lastMemoriesJson = JSON.stringify(merged);
          saveMemories(merged);
          setState({ memories: merged });
        } catch {
          // malformed remote payload — ignore, keep local state
        }
      },
      () => {
        // listen canceled (permission/connectivity) — stay local-only
      }
    ) : () => {};

    const unsubProjects = db && projectsRef ? onValue(
      projectsRef,
      (snap) => {
        if (activeUid !== uid || !snap.exists()) return;
        const json = snap.val() as string;
        if (json === lastProjectsJson) return;
        try {
          const remoteProjects: Project[] = JSON.parse(json);
          const merged = mergeProjects(getState().projects, remoteProjects);
          lastProjectsJson = JSON.stringify(merged);
          saveProjects(merged);
          setState({ projects: merged });
        } catch {
          // malformed remote payload — ignore, keep local state
        }
      },
      () => {
        // listen canceled (permission/connectivity) — stay local-only
      }
    ) : () => {};

    unsubscribers = [unsubChats, unsubMemories, unsubProjects];
  } catch {
    // onValue itself threw synchronously — stay local-only
  }
}

export function stopCloudSync(): void {
  activeUid = null;
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  if (chatsPushTimer) clearTimeout(chatsPushTimer);
  if (settingsPushTimer) clearTimeout(settingsPushTimer);
  if (memoriesPushTimer) clearTimeout(memoriesPushTimer);
  if (projectsPushTimer) clearTimeout(projectsPushTimer);
  chatsPushTimer = null;
  settingsPushTimer = null;
  hasPendingLocalSettingsWrite = false;
  settingsWriteRevision = 0;
  memoriesPushTimer = null;
  projectsPushTimer = null;
  lastChatsJson = null;
  lastSettingsJson = null;
  lastMemoriesJson = null;
  lastProjectsJson = null;
}

/** Debounced Firestore push, skipped while messages stream to avoid excess writes. */
export function pushChatsToCloud(chats: Chat[]): void {
  if (!activeUid) return;
  if (chats.some((c) => c.messages.some((m) => m.streaming))) return;
  const json = JSON.stringify(chats);
  if (json === lastChatsJson) return;
  const uid = activeUid;
  if (chatsPushTimer) clearTimeout(chatsPushTimer);
  chatsPushTimer = setTimeout(() => {
    if (activeUid !== uid) return; // signed out (or switched accounts) before this fired
    lastChatsJson = json;
    void loadFirestore().then((fs) => fs?.setDoc(fs.doc(fs.db, "users", uid), { chatsJson: json }, { merge: true }).catch(() => {}));
  }, 2000);
}

export function pushSettingsToCloud(settings: LofinSettings): void {
  if (!activeUid) return;
  const json = settingsJsonForCloud(settings);
  if (json === lastSettingsJson) return;
  const uid = activeUid;
  const writeRevision = ++settingsWriteRevision;
  hasPendingLocalSettingsWrite = true;
  if (settingsPushTimer) clearTimeout(settingsPushTimer);
  settingsPushTimer = setTimeout(() => {
    if (activeUid !== uid) return; // signed out (or switched accounts) before this fired
    loadFirestore().then((fs) => {
      if (!fs) throw new Error("Firestore is unavailable");
      return fs.setDoc(fs.doc(fs.db, "users", uid), { settingsJson: json }, { merge: true });
    })
      .then(() => {
        if (activeUid !== uid || writeRevision !== settingsWriteRevision) return;
        lastSettingsJson = json;
        hasPendingLocalSettingsWrite = false;
      })
      .catch(() => {
        // Keep the pending flag set: a stale cloud snapshot must not undo a
        // setting that was saved locally but could not be uploaded.
      });
  }, 2000);
}

export function pushProjectsToCloud(projects: Project[]): void {
  if (!activeUid) return;
  const db = getRtdb();
  if (!db) return;
  const json = JSON.stringify(projects);
  if (json === lastProjectsJson) return;
  const uid = activeUid;
  if (projectsPushTimer) clearTimeout(projectsPushTimer);
  projectsPushTimer = setTimeout(() => {
    if (activeUid !== uid) return; // signed out (or switched accounts) before this fired
    lastProjectsJson = json;
    dbSet(ref(db, `users/${uid}/projectsJson`), json).catch(() => {});
  }, 2000);
}

export function pushMemoriesToCloud(memories: MemoryEntry[]): void {
  if (!activeUid) return;
  const db = getRtdb();
  if (!db) return;
  const json = JSON.stringify(memories);
  if (json === lastMemoriesJson) return;
  const uid = activeUid;
  if (memoriesPushTimer) clearTimeout(memoriesPushTimer);
  memoriesPushTimer = setTimeout(() => {
    if (activeUid !== uid) return; // signed out (or switched accounts) before this fired
    lastMemoriesJson = json;
    dbSet(ref(db, `users/${uid}/memoriesJson`), json).catch(() => {});
  }, 2000);
}

/**
 * Mirrors each chat to a public Firestore document keyed only by chat id — this is what makes
 * "/c/{id}" links work for someone who isn't signed in (see fetchPublicChat below and
 * App.tsx's shared-chat view). Anyone with the exact link can read it; the id is an
 * unguessable UUID, so this is "unlisted", not access-controlled. Runs independent of
 * sign-in state (public chats aren't user-scoped), debounced per chat id.
 */
const lastPublicJson = new Map<string, string>();
const publicPushTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function pushChatsPublic(chats: Chat[]): void {
  for (const chat of chats) {
    if (chat.messages.length === 0) continue; // nothing worth a link yet
    if (chat.messages.some((m) => m.streaming)) continue; // wait until settled, same as pushChatsToCloud
    const json = JSON.stringify(chat);
    if (lastPublicJson.get(chat.id) === json) continue;

    const existing = publicPushTimers.get(chat.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      publicPushTimers.delete(chat.id);
      lastPublicJson.set(chat.id, json);
      void loadFirestore().then((fs) => fs?.setDoc(fs.doc(fs.db, "publicChats", chat.id), { json }).catch(() => {}));
    }, 2000);
    publicPushTimers.set(chat.id, timer);
  }
}

/** Looks up a shared chat by id for an unauthenticated visitor. Returns null if it
 * doesn't exist, the database isn't reachable, or the payload is malformed. */
/**
 * Deletes a chat from Firestore immediately, bypassing the debounced push and the
 * merge-by-id logic that would otherwise resurrect it from a stale remote or
 * other-tab copy. Also removes its public share link, which pushChatsPublic
 * never cleans up since it only ever writes chats that still exist.
 */
export function deleteChatFromCloud(chatId: string, remainingChats: Chat[]): void {
  deleteChatsFromCloud([chatId], remainingChats);
}

/** Batch form of deleteChatFromCloud — one user-doc write for any number of chats. */
export function deleteChatsFromCloud(chatIds: string[], remainingChats: Chat[]): void {
  const rtdb = getRtdb();
  for (const chatId of chatIds) {
    const publicTimer = publicPushTimers.get(chatId);
    if (publicTimer) {
      clearTimeout(publicTimer);
      publicPushTimers.delete(chatId);
    }
    lastPublicJson.delete(chatId);
    void loadFirestore().then((fs) => fs?.deleteDoc(fs.doc(fs.db, "publicChats", chatId)).catch(() => {}));
    // Remove the previous public RTDB copy too, so an old share link can't
    // continue serving a chat that was deleted after the migration.
    if (rtdb) dbSet(ref(rtdb, `publicChats/${chatId}`), null).catch(() => {});
  }

  if (!activeUid) return;
  const uid = activeUid;
  if (chatsPushTimer) {
    clearTimeout(chatsPushTimer);
    chatsPushTimer = null;
  }
  const json = JSON.stringify(remainingChats);
  lastChatsJson = json;
  void loadFirestore().then((fs) => fs?.setDoc(fs.doc(fs.db, "users", uid), { chatsJson: json }, { merge: true }).catch(() => {}));
}

export async function fetchPublicChat(id: string): Promise<Chat | null> {
  const fs = await loadFirestore();
  if (!fs) return null;
  try {
    const snap = await fs.getDoc(fs.doc(fs.db, "publicChats", id));
    if (snap.exists()) {
      const json = snap.data().json;
      return typeof json === "string" ? JSON.parse(json) as Chat : null;
    }
    // Keep pre-migration share URLs working. Any subsequent save writes the
    // current version to Firestore; this fallback never writes new RTDB data.
    const rtdb = getRtdb();
    if (!rtdb) return null;
    const legacy = await dbGet(ref(rtdb, `publicChats/${id}`));
    return legacy.exists() ? JSON.parse(legacy.val() as string) as Chat : null;
  } catch {
    return null;
  }
}
