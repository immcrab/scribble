import { loadFirestore } from "./firebase";
import type { Chat } from "../types";

/** A deliberately small view of a user's Firestore-backed chat history for /admin. */
export interface AdminSavedChats {
  uid: string;
  chats: Chat[];
}

/**
 * Fetch each saved-chat blob. Firestore rules independently enforce that this is
 * only callable by the verified administrator; keeping this client-side means no
 * additional server credential can read private chats.
 */
export async function fetchAdminSavedChats(): Promise<AdminSavedChats[]> {
  const fs = await loadFirestore();
  if (!fs) throw new Error("Firestore is unavailable.");
  const snapshot = await fs.getDocs(fs.collection(fs.db, "users"));
  const result: AdminSavedChats[] = [];
  for (const item of snapshot.docs) {
    const raw = item.data().chatsJson;
    if (typeof raw !== "string") continue;
    try {
      const chats = JSON.parse(raw) as unknown;
      if (Array.isArray(chats)) result.push({ uid: item.id, chats: chats as Chat[] });
    } catch {
      // A damaged legacy blob should not make every other user's data invisible.
    }
  }
  return result.sort((a, b) => Math.max(0, ...b.chats.map((chat) => chat.updatedAt)) - Math.max(0, ...a.chats.map((chat) => chat.updatedAt)));
}
