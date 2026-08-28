import { get as dbGet, onValue, ref, set as dbSet } from "firebase/database";
import { getRtdb } from "./firebase";
import { saveChats, saveSettings, saveMemories, saveProjects, type ScribbleSettings } from "./storage";
import type { Chat, MemoryEntry, Project } from "../types";

/**
 * Cross-device continuity: the same JSON already used for localStorage
 * (see storage.ts) round-trips through Realtime Database under
 * users/{uid}/chatsJson and users/{uid}/settingsJson as plain strings —
 * no separate RTDB data model to keep in sync with the local one.
 *
 * Merging is last-write-wins *per chat* (by id, comparing updatedAt), so a
 * chat that only exists on one device always survives — logging in on a
 * second device unions histories instead of one clobbering the other.
 * Settings merge the same way as one whole-object comparison, except
 * `password`, `customProviders`, and `customModels` always stay local
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

export function mergeSettings(local: ScribbleSettings, remote: ScribbleSettings | null): ScribbleSettings {
  if (!remote) return local;
  const winner = remote.updatedAt > local.updatedAt ? remote : local;
  return { ...winner, password: local.password, customProviders: local.customProviders, customModels: local.customModels };
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
let memoriesPushTimer: ReturnType<typeof setTimeout> | null = null;
let projectsPushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Called once on sign-in. Reads whatever's already in the cloud, merges it
 * with what's on this device, applies the merged result locally, pushes it
 * back up (covers the case where this device had data the cloud didn't),
 * then subscribes for live updates from other devices/tabs.
 *
 * Every entry point into the Realtime Database SDK is wrapped defensively —
 * if the database isn't actually provisioned for this Firebase project (or
 * the app is offline), sync silently doesn't happen instead of throwing;
 * local storage is the source of truth either way.
 */
export async function startCloudSync(
  uid: string,
  getState: () => { chats: Chat[]; settings: ScribbleSettings; memories: MemoryEntry[]; projects: Project[] },
  setState: (patch: { chats?: Chat[]; settings?: ScribbleSettings; memories?: MemoryEntry[]; projects?: Project[] }) => void
): Promise<void> {
  activeUid = uid;

  const db = getRtdb();
  if (!db) return;
  const chatsRef = ref(db, `users/${uid}/chatsJson`);
  const settingsRef = ref(db, `users/${uid}/settingsJson`);
  const memoriesRef = ref(db, `users/${uid}/memoriesJson`);
  const projectsRef = ref(db, `users/${uid}/projectsJson`);

  try {
    const [chatsSnap, settingsSnap, memoriesSnap, projectsSnap] = await Promise.all([
      dbGet(chatsRef),
      dbGet(settingsRef),
      dbGet(memoriesRef),
      dbGet(projectsRef),
    ]);
    if (activeUid !== uid) return; // signed out again before this resolved

    const remoteChats: Chat[] = chatsSnap.exists() ? JSON.parse(chatsSnap.val()) : [];
    const remoteSettings: ScribbleSettings | null = settingsSnap.exists() ? JSON.parse(settingsSnap.val()) : null;
    const remoteMemories: MemoryEntry[] = memoriesSnap.exists() ? JSON.parse(memoriesSnap.val()) : [];
    const remoteProjects: Project[] = projectsSnap.exists() ? JSON.parse(projectsSnap.val()) : [];

    const mergedChats = mergeChats(getState().chats, remoteChats);
    const mergedSettings = mergeSettings(getState().settings, remoteSettings);
    const mergedMemories = mergeMemories(getState().memories, remoteMemories);
    const mergedProjects = mergeProjects(getState().projects, remoteProjects);

    lastChatsJson = JSON.stringify(mergedChats);
    lastSettingsJson = JSON.stringify(mergedSettings);
    lastMemoriesJson = JSON.stringify(mergedMemories);
    lastProjectsJson = JSON.stringify(mergedProjects);
    saveChats(mergedChats);
    saveSettings(mergedSettings);
    saveMemories(mergedMemories);
    saveProjects(mergedProjects);
    setState({ chats: mergedChats, settings: mergedSettings, memories: mergedMemories, projects: mergedProjects });

    dbSet(chatsRef, lastChatsJson).catch(() => {});
    dbSet(settingsRef, lastSettingsJson).catch(() => {});
    dbSet(memoriesRef, lastMemoriesJson).catch(() => {});
    dbSet(projectsRef, lastProjectsJson).catch(() => {});
  } catch {
    // Offline, permission-denied, database not provisioned, etc. — sync
    // just doesn't happen this session; local data still works.
    return;
  }

  try {
    const unsubChats = onValue(
      chatsRef,
      (snap) => {
        if (activeUid !== uid || !snap.exists()) return;
        const json = snap.val() as string;
        if (json === lastChatsJson) return; // our own write echoing back
        try {
          const remoteChats: Chat[] = JSON.parse(json);
          const merged = mergeChats(getState().chats, remoteChats);
          lastChatsJson = JSON.stringify(merged);
          saveChats(merged);
          setState({ chats: merged });
        } catch {
          // malformed remote payload — ignore, keep local state
        }
      },
      () => {
        // listen canceled (permission/connectivity) — stay local-only
      }
    );

    const unsubSettings = onValue(
      settingsRef,
      (snap) => {
        if (activeUid !== uid || !snap.exists()) return;
        const json = snap.val() as string;
        if (json === lastSettingsJson) return;
        try {
          const remoteSettings: ScribbleSettings = JSON.parse(json);
          const merged = mergeSettings(getState().settings, remoteSettings);
          lastSettingsJson = JSON.stringify(merged);
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

    const unsubMemories = onValue(
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
    );

    const unsubProjects = onValue(
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
    );

    unsubscribers = [unsubChats, unsubSettings, unsubMemories, unsubProjects];
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
  memoriesPushTimer = null;
  projectsPushTimer = null;
  lastChatsJson = null;
  lastSettingsJson = null;
  lastMemoriesJson = null;
  lastProjectsJson = null;
}

/** Debounced push, skipped entirely while any message is actively streaming so tokens don't hammer RTDB. */
export function pushChatsToCloud(chats: Chat[]): void {
  if (!activeUid) return;
  const db = getRtdb();
  if (!db) return;
  if (chats.some((c) => c.messages.some((m) => m.streaming))) return;
  const json = JSON.stringify(chats);
  if (json === lastChatsJson) return;
  const uid = activeUid;
  if (chatsPushTimer) clearTimeout(chatsPushTimer);
  chatsPushTimer = setTimeout(() => {
    if (activeUid !== uid) return; // signed out (or switched accounts) before this fired
    lastChatsJson = json;
    dbSet(ref(db, `users/${uid}/chatsJson`), json).catch(() => {});
  }, 2000);
}

export function pushSettingsToCloud(settings: ScribbleSettings): void {
  if (!activeUid) return;
  const db = getRtdb();
  if (!db) return;
  const json = JSON.stringify(settings);
  if (json === lastSettingsJson) return;
  const uid = activeUid;
  if (settingsPushTimer) clearTimeout(settingsPushTimer);
  settingsPushTimer = setTimeout(() => {
    if (activeUid !== uid) return; // signed out (or switched accounts) before this fired
    lastSettingsJson = json;
    dbSet(ref(db, `users/${uid}/settingsJson`), json).catch(() => {});
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
 * Mirrors each chat to a public RTDB path keyed only by chat id — this is what makes
 * "/c/{id}" links work for someone who isn't signed in (see fetchPublicChat below and
 * App.tsx's shared-chat view). Anyone with the exact link can read it; the id is an
 * unguessable UUID, so this is "unlisted", not access-controlled. Runs independent of
 * sign-in state (public chats aren't user-scoped), debounced per chat id.
 */
const lastPublicJson = new Map<string, string>();
const publicPushTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function pushChatsPublic(chats: Chat[]): void {
  const db = getRtdb();
  if (!db) return;
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
      dbSet(ref(db, `publicChats/${chat.id}`), json).catch(() => {});
    }, 2000);
    publicPushTimers.set(chat.id, timer);
  }
}

/** Looks up a shared chat by id for an unauthenticated visitor. Returns null if it
 * doesn't exist, the database isn't reachable, or the payload is malformed. */
/**
 * Deletes a chat from RTDB immediately, bypassing the debounced push and the
 * merge-by-id logic that would otherwise resurrect it from a stale remote or
 * other-tab copy. Also removes its public share link, which pushChatsPublic
 * never cleans up since it only ever writes chats that still exist.
 */
export function deleteChatFromCloud(chatId: string, remainingChats: Chat[]): void {
  const db = getRtdb();
  if (!db) return;

  const publicTimer = publicPushTimers.get(chatId);
  if (publicTimer) {
    clearTimeout(publicTimer);
    publicPushTimers.delete(chatId);
  }
  lastPublicJson.delete(chatId);
  dbSet(ref(db, `publicChats/${chatId}`), null).catch(() => {});

  if (!activeUid) return;
  const uid = activeUid;
  if (chatsPushTimer) {
    clearTimeout(chatsPushTimer);
    chatsPushTimer = null;
  }
  const json = JSON.stringify(remainingChats);
  lastChatsJson = json;
  dbSet(ref(db, `users/${uid}/chatsJson`), json).catch(() => {});
}

export async function fetchPublicChat(id: string): Promise<Chat | null> {
  const db = getRtdb();
  if (!db) return null;
  try {
    const snap = await dbGet(ref(db, `publicChats/${id}`));
    if (!snap.exists()) return null;
    return JSON.parse(snap.val() as string) as Chat;
  } catch {
    return null;
  }
}
