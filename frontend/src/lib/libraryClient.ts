import { useAuthStore } from "../state/authStore";
import { useChatStore } from "../state/chatStore";

/** One saved image in the signed-in user's library (stored privately in Cloudflare R2). */
export interface LibraryItem {
  id: string;
  prompt: string;
  model: string;
  createdAt: number;
  size: number;
  type: string;
}

const THUMB_MAX_EDGE = 512;

function workerBase(): string {
  return useChatStore.getState().settings.workerUrl.replace(/\/$/, "");
}

async function authHeader(): Promise<Record<string, string>> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error("Sign in to use your image library.");
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new Error(body?.error || `${fallback} (${res.status})`);
}

/** Downscaled WebP for the grid so it doesn't pull every full-size image. */
async function makeThumbnail(blob: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  } catch {
    return null;
  }
}

/** Saves a generated/edited image (data: URL) to the user's library. Throws with a
 * user-facing message; callers that save in the background should swallow it. */
export async function saveToLibrary({ dataUrl, prompt, model }: { dataUrl: string; prompt: string; model: string }): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.append("image", new File([blob], "image", { type: blob.type }));
  const thumb = await makeThumbnail(blob);
  if (thumb && thumb.type === "image/webp") form.append("thumb", new File([thumb], "thumb.webp", { type: "image/webp" }));
  form.append("prompt", prompt);
  form.append("model", model);

  const res = await fetch(`${workerBase()}/api/library`, { method: "POST", headers: await authHeader(), body: form });
  if (!res.ok) throw await errorFrom(res, "Could not save image");
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function listLibrary(cursor?: string | null): Promise<{ items: LibraryItem[]; cursor: string | null }> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const res = await fetch(`${workerBase()}/api/library${qs}`, { headers: await authHeader() });
  if (!res.ok) throw await errorFrom(res, "Could not load your library");
  return (await res.json()) as { items: LibraryItem[]; cursor: string | null };
}

const blobUrls = new Map<string, Promise<string>>();

/** Fetches a private image with the user's token and returns an object URL for <img>.
 * Cached for the session so reopening the grid doesn't re-download. */
export function libraryImageUrl(id: string, thumb: boolean): Promise<string> {
  const key = `${id}:${thumb ? "t" : "f"}`;
  let cached = blobUrls.get(key);
  if (!cached) {
    cached = (async () => {
      const res = await fetch(`${workerBase()}/api/library/${id}${thumb ? "?thumb=1" : ""}`, { headers: await authHeader() });
      if (!res.ok) throw await errorFrom(res, "Could not load image");
      return URL.createObjectURL(await res.blob());
    })();
    cached.catch(() => blobUrls.delete(key));
    blobUrls.set(key, cached);
  }
  return cached;
}

export async function deleteLibraryItem(id: string): Promise<void> {
  const res = await fetch(`${workerBase()}/api/library/${id}`, { method: "DELETE", headers: await authHeader() });
  if (!res.ok) throw await errorFrom(res, "Could not delete image");
  for (const suffix of ["t", "f"]) {
    const key = `${id}:${suffix}`;
    void blobUrls.get(key)?.then((u) => URL.revokeObjectURL(u));
    blobUrls.delete(key);
  }
}
