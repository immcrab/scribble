import { useAuthStore } from "../state/authStore";
import { useChatStore } from "../state/chatStore";
import { announcementImageUrlForSite } from "./catalogSync";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Uploads artwork to the Worker's R2 bucket (admin-only endpoint) and returns its public
 * URL. Used for announcement and connection images. Throws with a user-facing message.
 */
export async function uploadAdminImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES) throw new Error("Choose an image under 5 MB.");
  const user = useAuthStore.getState().user;
  if (!user) throw new Error("Sign in as an admin to upload artwork.");
  const worker = useChatStore.getState().settings.workerUrl.replace(/\/$/, "");
  const token = await user.getIdToken();
  const res = await fetch(`${worker}/api/admin/announcement-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type },
    body: file,
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error || "Upload failed.");
  return announcementImageUrlForSite(data.url);
}
