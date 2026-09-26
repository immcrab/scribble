import type { Env } from "./types";
import { verifyFirebaseIdToken } from "./firebaseVerifyToken";

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

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const TYPE_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_TYPE).map(([t, e]) => [e, t]));

export interface LibraryItem {
  id: string;
  prompt: string;
  model: string;
  createdAt: number;
  size: number;
  type: string;
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
  return /^[0-9]{10,16}-[a-f0-9]{8}$/.test(id);
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
  return pathname === "/api/library" || pathname.startsWith("/api/library/");
}

export async function handleLibrary(request: Request, env: Env, url: URL, cors: HeadersInit, json: Json): Promise<Response> {
  const bucket = env.ANNOUNCEMENT_ASSETS;
  if (!bucket) return json({ error: "Image library storage is not configured." }, 503, cors);

  const auth = await authenticate(request, env);
  if ("error" in auth) return json({ error: auth.error }, auth.status, cors);
  if (!safeUid(auth.uid)) return json({ error: "Invalid account." }, 403, cors);
  const prefix = `library/${auth.uid}/`;

  const rest = url.pathname.slice("/api/library".length).replace(/^\//, "");

  // GET /api/library — newest first, one page at a time.
  if (rest === "" && request.method === "GET") {
    const cursor = url.searchParams.get("cursor") || undefined;
    const listed = await bucket.list({ prefix, limit: 1000, cursor, include: ["customMetadata"] } as R2ListOptions);
    const items: LibraryItem[] = [];
    for (const obj of listed.objects) {
      const name = obj.key.slice(prefix.length);
      if (name.includes(".thumb.")) continue;
      const dot = name.lastIndexOf(".");
      const id = name.slice(0, dot);
      if (!safeId(id)) continue;
      items.push({
        id,
        prompt: decodeMeta(obj.customMetadata?.prompt),
        model: decodeMeta(obj.customMetadata?.model),
        createdAt: Number(id.split("-")[0]),
        size: obj.size,
        type: TYPE_BY_EXT[name.slice(dot + 1)] ?? "image/png",
      });
    }
    items.sort((a, b) => b.createdAt - a.createdAt);
    return json({ items, cursor: listed.truncated ? listed.cursor : null }, 200, cors);
  }

  // POST /api/library — multipart: image, thumb (optional), prompt, model.
  if (rest === "" && request.method === "POST") {
    const len = Number(request.headers.get("Content-Length") ?? 0);
    if (len > MAX_FORM_BYTES) return json({ error: "Image is too large to save (10 MB max)." }, 413, cors);
    const form = await request.formData().catch(() => null);
    const image: unknown = form?.get("image");
    if (!form || !(image instanceof File)) return json({ error: "Attach the image to save." }, 400, cors);
    const ext = EXT_BY_TYPE[image.type];
    if (!ext) return json({ error: "Unsupported image type." }, 400, cors);
    if (image.size === 0 || image.size > 10 * 1024 * 1024) return json({ error: "Image is too large to save (10 MB max)." }, 413, cors);

    // Cap storage per account so the library can't be used as free bulk hosting.
    const existing = await bucket.list({ prefix, limit: MAX_ITEMS_PER_USER * 2 });
    const count = existing.objects.filter((o) => !o.key.includes(".thumb.")).length;
    if (count >= MAX_ITEMS_PER_USER || existing.truncated) {
      return json({ error: `Your library is full (${MAX_ITEMS_PER_USER} images). Delete some to save more.` }, 409, cors);
    }

    const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const meta = (value: unknown, max: number): string => {
      const encoded = encodeURIComponent(typeof value === "string" ? value.slice(0, max) : "");
      return encoded.length > 900 ? "" : encoded;
    };
    const cacheControl = "private, max-age=31536000, immutable";
    await bucket.put(`${prefix}${id}.${ext}`, await image.arrayBuffer(), {
      httpMetadata: { contentType: image.type, cacheControl },
      customMetadata: { prompt: meta(form.get("prompt"), 240), model: meta(form.get("model"), 60) },
    });
    const thumb: unknown = form.get("thumb");
    if (thumb instanceof File && thumb.type === "image/webp" && thumb.size > 0 && thumb.size <= MAX_THUMB_BYTES) {
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
