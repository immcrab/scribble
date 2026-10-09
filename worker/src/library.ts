import type { Env } from "./types";
import { verifyFirebaseIdToken } from "./firebaseVerifyToken";
import { listStoredWebsites } from "./websites";

/**
 * Per-user image library. Generated images are stored in R2 under
 * `library/{uid}/{id}.{ext}` with a small `{id}.thumb.webp` beside each one for the
 * grid. Objects are private: every read goes through the Worker and is checked against
 * the caller's Firebase uid, so a key can never be fetched by someone else.
 *
 * The bucket is shared with announcement artwork (the ANNOUNCEMENT_ASSETS binding) —
 * the `library/` prefix keeps the two apart, and it avoids a second bucket to provision.
 */

const MAX_FORM_BYTES = 12 * 1024 * 1024;
const MAX_THUMB_BYTES = 1024 * 1024;
const MAX_ITEMS_PER_USER = 300;
const ADMIN_EMAIL = "imcrabfr@gmail.com";

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/json": "json",
  "text/javascript": "js",
  "application/typescript": "ts",
  "text/csv": "csv",
  "text/html": "html",
  "text/css": "css",
  "application/octet-stream": "bin",
};
const TYPE_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_TYPE).map(([t, e]) => [e, t]));

export interface LibraryItem {
  id: string;
  prompt: string;
  model: string;
  createdAt: number;
  size: number;
  type: string;
  name?: string;
  category?: "generated" | "uploaded" | "speech" | "file";
  kind?: "website";
  url?: string;
  expiresAt?: number;
}

type Json = (body: unknown, status: number, headers: HeadersInit) => Response;

async function authenticate(request: Request, env: Env): Promise<{ uid: string } | { error: string; status: number }> {
  if (!env.FIREBASE_PROJECT_ID) return { error: "Image library is not configured.", status: 503 };
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Sign in to use your image library.", status: 401 };
  try {
    const claims = await verifyFirebaseIdToken(token, env.FIREBASE_PROJECT_ID);
    return { uid: claims.uid };
  } catch {
    return { error: "Your sign-in expired. Please sign in again.", status: 401 };
  }
}

function safeUid(uid: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(uid);
}

function safeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

function decodeMeta(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

/** True for a /api/library or /api/library/{id} request the handler below should own. */
export function isLibraryPath(pathname: string): boolean {
  return pathname === "/api/library" || pathname.startsWith("/api/library/") || pathname === "/api/storage" || pathname.startsWith("/api/storage/");
}

/** Admin-only inspection route; kept separate from normal user-owned routes. */
export function isAdminLibraryPath(pathname: string): boolean {
  return pathname === "/api/admin/library" || pathname.startsWith("/api/admin/library/");
}

function storedType(obj: R2Object): string {
  return decodeMeta(obj.customMetadata?.type) || TYPE_BY_EXT[obj.key.split(".").pop() ?? ""] || "application/octet-stream";
}

function storedCategory(obj: R2Object, type: string): "generated" | "uploaded" | "speech" | "file" {
  const category = decodeMeta(obj.customMetadata?.category);
  if (category === "generated" || category === "uploaded" || category === "speech" || category === "file") return category;
  // Files saved before categories were introduced included generated images in
  // the image-only library. Keep that useful default while the client backfill
  // upgrades any old uploads that still exist in chat history.
  return type.startsWith("image/") ? "generated" : type.startsWith("audio/") ? "speech" : "file";
}

export async function handleLibrary(request: Request, env: Env, url: URL, cors: HeadersInit, json: Json): Promise<Response> {
  const bucket = env.ANNOUNCEMENT_ASSETS;
  if (!bucket) return json({ error: "Image library storage is not configured." }, 503, cors);

  const auth = await authenticate(request, env);
  if ("error" in auth) return json({ error: auth.error }, auth.status, cors);
  if (!safeUid(auth.uid)) return json({ error: "Invalid account." }, 403, cors);
  const prefix = `library/${auth.uid}/`;

  const storageApi = url.pathname === "/api/storage" || url.pathname.startsWith("/api/storage/");
  const apiRoot = storageApi ? "/api/storage" : "/api/library";
  const rest = url.pathname.slice(apiRoot.length).replace(/^\//, "");

  // GET /api/library — newest first, one page at a time.
  if (rest === "" && request.method === "GET") {
    const cursor = url.searchParams.get("cursor") || undefined;
    const listed = await bucket.list({ prefix, limit: 1000, cursor, include: ["customMetadata"] } as R2ListOptions);
    const items: LibraryItem[] = [];
    // Every byte under the user's prefix counts toward their storage, including
    // thumbnails and files the list below hides from this view.
    let usedBytes = 0;
    for (const obj of listed.objects) {
      usedBytes += obj.size;
      const name = obj.key.slice(prefix.length);
      if (name.includes(".thumb.")) continue;
      const dot = name.lastIndexOf(".");
      const id = name.slice(0, dot);
      if (!safeId(id)) continue;
      const type = storedType(obj);
      // The Library page is intentionally image-only. Storage includes every file.
      if (!storageApi && !type.startsWith("image/")) continue;
      items.push({
        id,
        prompt: decodeMeta(obj.customMetadata?.prompt),
        model: decodeMeta(obj.customMetadata?.model),
        createdAt: Number(obj.customMetadata?.createdAt) || Number(id.split("-")[0]) || obj.uploaded.getTime(),
        size: obj.size,
        type,
        name: decodeMeta(obj.customMetadata?.name),
        category: storedCategory(obj, type),
      });
    }
    // Website artifacts use their own R2 prefix and public origin, but they are
    // still user-owned cloud files. Include them only in /api/storage, never in
    // the image-focused Library page.
    if (storageApi) {
      const origin = env.PUBLIC_WEBSITE_ORIGIN?.trim() || url.origin;
      const websites = await listStoredWebsites(bucket, auth.uid, origin);
      items.push(...websites.map((site): LibraryItem => ({ ...site, prompt: "", model: "" })));
      usedBytes += websites.reduce((total, site) => total + site.size, 0);
    }
    items.sort((a, b) => b.createdAt - a.createdAt);
    return json({ items, cursor: listed.truncated ? listed.cursor : null, usedBytes }, 200, cors);
  }

  // POST /api/library or /api/storage — multipart: image/file, thumb (optional), metadata.
  if (rest === "" && request.method === "POST") {
    const len = Number(request.headers.get("Content-Length") ?? 0);
    if (len > MAX_FORM_BYTES) return json({ error: "Image is too large to save (10 MB max)." }, 413, cors);
    const form = await request.formData().catch(() => null);
    const file: unknown = form?.get(storageApi ? "file" : "image");
    if (!form || !(file instanceof File)) return json({ error: storageApi ? "Attach a file to save." : "Attach the image to save." }, 400, cors);
    // Chat uploads may be any browser-provided MIME type. Known types keep a
    // readable extension; the private .bin fallback preserves the real type in
    // metadata and response headers.
    const ext = EXT_BY_TYPE[file.type] ?? "bin";
    if (!storageApi && !file.type.startsWith("image/")) return json({ error: "Attach an image to save." }, 400, cors);
    if (file.size === 0 || file.size > 10 * 1024 * 1024) return json({ error: "File is too large to save (10 MB max)." }, 413, cors);

    const requestedId = typeof form.get("id") === "string" ? String(form.get("id")) : "";
    const id = safeId(requestedId) ? requestedId : `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    // Cap storage per account so it can't be used as free bulk hosting. A
    // stable attachment id can overwrite its existing object even at capacity.
    const existing = await bucket.list({ prefix, limit: MAX_ITEMS_PER_USER * 2 });
    const count = existing.objects.filter((o) => !o.key.includes(".thumb.")).length;
    const replacing = existing.objects.some((o) => Object.values(EXT_BY_TYPE).some((oldExt) => o.key === `${prefix}${id}.${oldExt}`));
    if (!replacing && (count >= MAX_ITEMS_PER_USER || existing.truncated)) {
      return json({ error: `Your storage is full (${MAX_ITEMS_PER_USER} files). Delete some to save more.` }, 409, cors);
    }
    const meta = (value: unknown, max: number): string => {
      const encoded = encodeURIComponent(typeof value === "string" ? value.slice(0, max) : "");
      return encoded.length > 900 ? "" : encoded;
    };
    const requestedCategory = form.get("category");
    const category = requestedCategory === "generated" || requestedCategory === "uploaded" || requestedCategory === "speech" || requestedCategory === "file"
      ? requestedCategory
      : !storageApi ? "generated" : file.type.startsWith("audio/") ? "speech" : file.type.startsWith("image/") ? "uploaded" : "file";
    const cacheControl = "private, max-age=31536000, immutable";
    await bucket.put(`${prefix}${id}.${ext}`, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "application/octet-stream", cacheControl },
      customMetadata: {
        prompt: meta(form.get("prompt"), 240),
        model: meta(form.get("model"), 60),
        name: meta(form.get("name") || file.name, 180),
        type: meta(file.type || "application/octet-stream", 120),
        category,
        createdAt: String(Date.now()),
      },
    });
    // A client can re-upload the same attachment after its MIME type changed.
    // Keep the stable id unambiguous by removing an obsolete extension.
    await bucket.delete(Object.values(EXT_BY_TYPE).filter((oldExt) => oldExt !== ext).map((oldExt) => `${prefix}${id}.${oldExt}`));
    const thumb: unknown = form.get("thumb");
    if (file.type.startsWith("image/") && thumb instanceof File && thumb.type === "image/webp" && thumb.size > 0 && thumb.size <= MAX_THUMB_BYTES) {
      await bucket.put(`${prefix}${id}.thumb.webp`, await thumb.arrayBuffer(), {
        httpMetadata: { contentType: "image/webp", cacheControl },
      });
    }
    return json({ id }, 201, cors);
  }

  if (!safeId(rest)) return json({ error: "Invalid image id." }, 400, cors);

  // GET /api/library/{id}[?thumb=1] — private image bytes.
  if (request.method === "GET") {
    const wantThumb = url.searchParams.get("thumb") === "1";
    let object: R2ObjectBody | null = null;
    if (wantThumb) object = await bucket.get(`${prefix}${rest}.thumb.webp`);
    if (!object) {
      for (const ext of Object.values(EXT_BY_TYPE)) {
        object = await bucket.get(`${prefix}${rest}.${ext}`);
        if (object) break;
      }
    }
    if (!object) return json({ error: "Image not found." }, 404, cors);
    return new Response(object.body, {
      headers: {
        ...cors,
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        ...(!object.httpMetadata?.contentType?.startsWith("image/") ? { "Content-Disposition": "attachment" } : {}),
      },
    });
  }

  // DELETE /api/library/{id} — the image and its thumbnail.
  if (request.method === "DELETE") {
    const keys = [`${prefix}${rest}.thumb.webp`, ...Object.values(EXT_BY_TYPE).map((ext) => `${prefix}${rest}.${ext}`)];
    await bucket.delete(keys);
    return json({ ok: true }, 200, cors);
  }

  return json({ error: "Method not allowed." }, 405, cors);
}

/**
 * Read-only support view of a user's private R2 library. Both the route and the
 * object bytes validate a verified Firebase administrator token, preventing an
 * ordinary signed-in user from swapping a uid into the URL.
 */
export async function handleAdminLibrary(request: Request, env: Env, url: URL, cors: HeadersInit, json: Json): Promise<Response> {
  const bucket = env.ANNOUNCEMENT_ASSETS;
  if (!bucket) return json({ error: "Image library storage is not configured." }, 503, cors);
  if (!env.FIREBASE_PROJECT_ID) return json({ error: "Image library is not configured." }, 503, cors);
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in as an admin to inspect user storage." }, 401, cors);
  try {
    const claims = await verifyFirebaseIdToken(token, env.FIREBASE_PROJECT_ID);
    if (claims.email !== ADMIN_EMAIL || !claims.emailVerified) return json({ error: "Admin access required." }, 403, cors);
  } catch {
    return json({ error: "Your sign-in expired. Please sign in again." }, 401, cors);
  }

  const rest = url.pathname.slice("/api/admin/library".length).replace(/^\//, "");
  const [uid, id, ...extra] = rest.split("/");
  if (!uid || extra.length || !safeUid(uid) || (id !== undefined && !safeId(id))) return json({ error: "Invalid library path." }, 400, cors);
  const prefix = `library/${uid}/`;

  if (id === undefined && request.method === "GET") {
    const listed = await bucket.list({ prefix, limit: 1000, include: ["customMetadata"] } as R2ListOptions);
    const items: LibraryItem[] = [];
    for (const obj of listed.objects) {
      const name = obj.key.slice(prefix.length);
      if (name.includes(".thumb.")) continue;
      const dot = name.lastIndexOf(".");
      const itemId = name.slice(0, dot);
      if (!safeId(itemId)) continue;
      const type = storedType(obj);
      items.push({
        id: itemId,
        prompt: decodeMeta(obj.customMetadata?.prompt),
        model: decodeMeta(obj.customMetadata?.model),
        createdAt: Number(obj.customMetadata?.createdAt) || Number(itemId.split("-")[0]) || obj.uploaded.getTime(),
        size: obj.size,
        type,
        name: decodeMeta(obj.customMetadata?.name),
        category: storedCategory(obj, type),
      });
    }
    items.sort((a, b) => b.createdAt - a.createdAt);
    return json({ items, cursor: listed.truncated ? listed.cursor : null }, 200, cors);
  }

  if (id !== undefined && request.method === "GET") {
    const wantThumb = url.searchParams.get("thumb") === "1";
    let object: R2ObjectBody | null = wantThumb ? await bucket.get(`${prefix}${id}.thumb.webp`) : null;
    if (!object) {
      for (const ext of Object.values(EXT_BY_TYPE)) {
        object = await bucket.get(`${prefix}${id}.${ext}`);
        if (object) break;
      }
    }
    if (!object) return json({ error: "File not found." }, 404, cors);
    return new Response(object.body, {
      headers: {
        ...cors,
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        ...(!object.httpMetadata?.contentType?.startsWith("image/") ? { "Content-Disposition": "attachment" } : {}),
      },
    });
  }
  return json({ error: "Method not allowed." }, 405, cors);
}
