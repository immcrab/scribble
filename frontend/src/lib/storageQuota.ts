import { useAuthStore } from "../state/authStore";
import { useChatStore } from "../state/chatStore";
import { listStorage } from "./libraryClient";
import type { Attachment, Chat } from "../types";

/** Every account gets 70 MB across browser data and private cloud storage. */
export const STORAGE_LIMIT_BYTES = 70 * 1024 * 1024;
export const STORAGE_FULL_MESSAGE = "Your storage is full (70 MB). You can't upload or create anything more until you delete some files in Settings → Storage.";

function attachmentBytes(attachment: Attachment, encoder: TextEncoder): number {
  return attachment.size || encoder.encode(attachment.dataUrl).length;
}

/** Browser-only bytes: chat text, memories, projects, plus attachments not
 * already backed up to the cloud (those are covered by the cloud total). */
export function localStorageBytes(chats: Chat[], memories: unknown, projects: unknown, cloudIds: Set<string>): number {
  const encoder = new TextEncoder();
  // Attachments are counted on their own, so leave their data URLs out of the chat text size.
  const textBytes = [chats, memories, projects].reduce<number>((total, value) => total + encoder.encode(JSON.stringify(value, (key, field) => key === "dataUrl" ? undefined : field)).length, 0);
  const attachments = chats.flatMap((chat) => (chat.messages ?? []).flatMap((message) => message.attachments ?? []));
  const localOnly = new Map(attachments.filter((attachment) => !cloudIds.has(attachment.id)).map((attachment) => [attachment.id, attachment]));
  return textBytes + [...localOnly.values()].reduce((total, attachment) => total + attachmentBytes(attachment, encoder), 0);
}

let cloudCache: { at: number; bytes: number; ids: Set<string> } | null = null;
const CLOUD_CACHE_MS = 20_000;

/** Call after uploads or deletes so the next check sees fresh cloud usage. */
export function invalidateStorageUsage(): void {
  cloudCache = null;
}

export async function currentStorageBytes(): Promise<number> {
  const { chats, memories, projects } = useChatStore.getState();
  let cloud = { bytes: 0, ids: new Set<string>() };
  if (useAuthStore.getState().user) {
    if (cloudCache && Date.now() - cloudCache.at < CLOUD_CACHE_MS) {
      cloud = cloudCache;
    } else {
      try {
        const page = await listStorage();
        cloud = { bytes: page.usedBytes ?? page.items.reduce((total, item) => total + item.size, 0), ids: new Set(page.items.map((item) => item.id)) };
        cloudCache = { at: Date.now(), ...cloud };
      } catch {
        // Offline or Worker unavailable: judge by local data; the Worker still enforces the cap.
      }
    }
  }
  return localStorageBytes(chats, memories, projects, cloud.ids) + cloud.bytes;
}

/** Returns a user-facing reason when the account is at or over its storage cap. */
export async function storageFullReason(extraBytes = 0): Promise<string | null> {
  const used = await currentStorageBytes();
  return used >= STORAGE_LIMIT_BYTES || used + extraBytes > STORAGE_LIMIT_BYTES ? STORAGE_FULL_MESSAGE : null;
}
