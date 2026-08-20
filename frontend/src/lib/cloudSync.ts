import { get as dbGet, onValue, ref, set as dbSet } from "firebase/database";
import { getRtdb } from "./firebase";
import { saveChats, saveSettings, type ScribbleSettings } from "./storage";
import type { Chat } from "../types";

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

let activeUid: string | null = null;
let unsubscribers: Array<() => void> = [];
let lastChatsJson: string | null = null;
let lastSettingsJson: string | null = null;
let chatsPushTimer: ReturnType<typeof setTimeout> | null = null;
let settingsPushTimer: ReturnType<typeof setTimeout> | null = null;

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
  getState: () => { chats: Chat[]; settings: ScribbleSettings },
  setState: (patch: { chats?: Chat[]; settings?: ScribbleSettings }) => void
): Promise<void> {
  activeUid = uid;

  const db = getRtdb();
  if (!db) return;
  const chatsRef = ref(db, `users/${uid}/chatsJson`);
  const settingsRef = ref(db, `users/${uid}/settingsJson`);

  try {
    const [chatsSnap, settingsSnap] = await Promise.all([dbGet(chatsRef), dbGet(settingsRef)]);
    if (activeUid !== uid) return; // signed out again before this resolved

    const remoteChats: Chat[] = chatsSnap.exists() ? JSON.parse(chatsSnap.val()) : [];
    const remoteSettings: ScribbleSettings | null = settingsSnap.exists() ? JSON.parse(settingsSnap.val()) : null;

    const mergedChats = mergeChats(getState().chats, remoteChats);
    const mergedSettings = mergeSettings(getState().settings, remoteSettings);

    lastChatsJson = JSON.stringify(mergedChats);
    lastSettingsJson = JSON.stringify(mergedSettings);
    saveChats(mergedChats);
    saveSettings(mergedSettings);
    setState({ chats: mergedChats, settings: mergedSettings });

    dbSet(chatsRef, lastChatsJson).catch(() => {});
    dbSet(settingsRef, lastSettingsJson).catch(() => {});
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

    unsubscribers = [unsubChats, unsubSettings];
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
  chatsPushTimer = null;
  settingsPushTimer = null;
  lastChatsJson = null;
  lastSettingsJson = null;
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
    lastSettingsJson = json;
    dbSet(ref(db, `users/${uid}/settingsJson`), json).catch(() => {});
  }, 2000);
}
