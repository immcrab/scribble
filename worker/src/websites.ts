import type { Env } from "./types";
import { verifyFirebaseIdToken } from "./firebaseVerifyToken";

/** Temporary websites are deliberately isolated from the Lofin app origin. */
const WEBSITE_HOST = "api.lofin.dev";
const PREFIX = "sites/";
const MANIFEST = "_lofin-site.json";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FILES = 100;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_SITE_BYTES = 10 * 1024 * 1024;

export interface WebsiteFile {
  name: string;
  content: string;
}

interface WebsiteManifest {
  uid: string;
  slug: string;
  createdAt: number;
  expiresAt: number;
  files: { name: string; contentType: string; size?: number }[];
}

/** A published site is represented as one managed item in private storage. */
export interface StoredWebsite {
  id: string;
  name: string;
  createdAt: number;
  expiresAt: number;
  size: number;
  type: "application/x-lofin-website";
  kind: "website";
  url: string;
}

type Json = (body: unknown, status: number, headers: HeadersInit) => Response;

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  ico: "image/x-icon", txt: "text/plain; charset=utf-8", xml: "application/xml; charset=utf-8",
  woff: "font/woff", woff2: "font/woff2", map: "application/json; charset=utf-8",
};

function contentType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

function validUid(uid: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(uid);
}

function validSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{3,63}$/.test(slug);
}

/** A safe relative path with no traversal or opaque dot-file surprise. */
function validFileName(name: string): boolean {
  if (!name || name.length > 240 || name.startsWith("/") || name.includes("\\") || /[\u0000-\u001f]/.test(name)) return false;
  const segments = name.split("/");
  return segments.length <= 12 && segments.every((segment) => segment && segment !== "." && segment !== "..");
}

function keyFor(uid: string, slug: string, name: string): string {
  return `${PREFIX}${uid}/${slug}/${name}`;
}

function manifestKey(uid: string, slug: string): string {
  return keyFor(uid, slug, MANIFEST);
}

function storageId(slug: string): string {
  return `website-${slug}`;
}

function siteUrl(origin: string, uid: string, slug: string): string {
  // A local/custom Worker deployment has no api.lofin.dev route. In that case
  // returning the Worker origin keeps this feature testable without DNS setup.
  const base = origin.replace(/\/$/, "");
  return `${base}/${encodeURIComponent(uid)}/${encodeURIComponent(slug)}`;
}

function sitePath(uid: string, slug: string): string {
  return `/${encodeURIComponent(uid)}/${encodeURIComponent(slug)}/`;
}

function encodedFilePath(name: string): string {
  return name.split("/").map(encodeURIComponent).join("/");
}

/**
 * The workspace preview deliberately combines sibling CSS and JS files so an
 * AI response is useful immediately, even if it forgot the boilerplate tags.
 * A published site is served as real files instead. Keep the live page just
 * as forgiving, without replacing author-provided links or scripts.
 */
function preparePublishedHtml(html: string, files: WebsiteManifest["files"], uid: string, slug: string): string {
  const fileNames = new Set(files.map((file) => file.name));
  const prefix = sitePath(uid, slug);
  const withFixedRootLinks = html.replace(
    /\b(href|src|action|poster)\s*=\s*(["'])(\/[^"']*)\2/gi,
    (whole, attribute: string, quote: string, value: string) => {
      const match = value.match(/^\/([^?#]*)([?#][\s\S]*)?$/);
      if (!match) return whole;
      let name: string;
      try {
        name = decodeURIComponent(match[1]);
      } catch {
        return whole;
      }
      // Only rewrite a path that is one of this site's uploaded files. This
      // preserves intentional links such as /login and external app routes.
      if (!fileNames.has(name)) return whole;
      return `${attribute}=${quote}${prefix}${encodedFilePath(name)}${match[2] ?? ""}${quote}`;
    },
  );

  const hasFileReference = (name: string, attribute: "href" | "src") => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${attribute}\\s*=\\s*(["'])[^"']*${escaped}(?:[?#][^"']*)?\\1`, "i").test(withFixedRootLinks);
  };
  const missingStyles = files
    .filter((file) => /\.css$/i.test(file.name) && !hasFileReference(file.name, "href"))
    .map((file) => `<link rel="stylesheet" href="${encodedFilePath(file.name)}">`)
    .join("\n");
  const missingScripts = files
    .filter((file) => /\.(?:js|mjs)$/i.test(file.name) && !hasFileReference(file.name, "src"))
    .map((file) => `<script src="${encodedFilePath(file.name)}"></script>`)
    .join("\n");

  let result = withFixedRootLinks;
  if (missingStyles) {
    result = /<\/head\s*>/i.test(result)
      ? result.replace(/<\/head\s*>/i, `${missingStyles}\n</head>`)
      : `${missingStyles}\n${result}`;
  }
  if (missingScripts) {
    result = /<\/body\s*>/i.test(result)
      ? result.replace(/<\/body\s*>/i, `${missingScripts}\n</body>`)
      : `${result}\n${missingScripts}`;
  }
  return result;
}

async function authenticatedUid(request: Request, env: Env): Promise<string | null> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !env.FIREBASE_PROJECT_ID) return null;
  try {
    const claims = await verifyFirebaseIdToken(token, env.FIREBASE_PROJECT_ID);
    return validUid(claims.uid) ? claims.uid : null;
  } catch {
    return null;
  }
}

function createSlug(): string {
  // UUID bytes make accidental collisions infeasible while the small prefix is
  // friendly in a link. It is intentionally not based on a user-provided title.
  return `site-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function parseFiles(value: unknown): WebsiteFile[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FILES) return null;
  const names = new Set<string>();
  let total = 0;
  const files: WebsiteFile[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const { name, content } = entry as Record<string, unknown>;
    if (typeof name !== "string" || typeof content !== "string" || !validFileName(name) || names.has(name)) return null;
    const bytes = new TextEncoder().encode(content).byteLength;
    if (!bytes || bytes > MAX_FILE_BYTES) return null;
    total += bytes;
    if (total > MAX_SITE_BYTES) return null;
    names.add(name);
    files.push({ name, content });
  }
  return files.some((file) => file.name.toLowerCase() === "index.html") ? files : null;
}

async function deleteManifestSite(bucket: R2Bucket, manifest: WebsiteManifest): Promise<void> {
  await bucket.delete([manifestKey(manifest.uid, manifest.slug), ...manifest.files.map((file) => keyFor(manifest.uid, manifest.slug, file.name))]);
}

/** POST /api/websites: persist a completed HTML artifact as a seven-day public site. */
export async function handleWebsiteApi(request: Request, env: Env, url: URL, cors: HeadersInit, json: Json): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, cors);
  if (!env.ANNOUNCEMENT_ASSETS) return json({ error: "Website publishing storage is not configured." }, 503, cors);
  const uid = await authenticatedUid(request, env);
  if (!uid) return json({ error: "Sign in to publish a website." }, 401, cors);

  const body = await request.json().catch(() => null) as { files?: unknown } | null;
  const files = parseFiles(body?.files);
  if (!files) return json({ error: "Publish an index.html file with up to 100 safe text files (10 MB total)." }, 400, cors);

  const slug = createSlug();
  const now = Date.now();
  const manifest: WebsiteManifest = {
    uid, slug, createdAt: now, expiresAt: now + TTL_MS,
    files: files.map((file) => ({
      name: file.name,
      contentType: contentType(file.name),
      size: new TextEncoder().encode(file.content).byteLength,
    })),
  };
  const bucket = env.ANNOUNCEMENT_ASSETS;
  try {
    await Promise.all(files.map((file) => bucket.put(keyFor(uid, slug, file.name), file.content, {
      httpMetadata: { contentType: contentType(file.name), cacheControl: "public, max-age=60, s-maxage=60" },
    })));
    await bucket.put(manifestKey(uid, slug), JSON.stringify(manifest), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
    });
  } catch {
    // Do not leave a half-published site accessible if one of the R2 writes fails.
    await deleteManifestSite(bucket, manifest).catch(() => undefined);
    return json({ error: "Could not save this website. Please try again." }, 502, cors);
  }

  const configuredOrigin = env.PUBLIC_WEBSITE_ORIGIN?.trim();
  const origin = configuredOrigin || url.origin;
  return json({ url: siteUrl(origin, uid, slug), expiresAt: manifest.expiresAt, slug }, 201, cors);
}

/**
 * Lists the temporary sites a user owns so Settings > Storage is a complete
 * inventory of their cloud-backed files. Site contents remain on their
 * isolated public origin; this exposes only the user's own site records.
 */
export async function listStoredWebsites(bucket: R2Bucket, uid: string, origin: string): Promise<StoredWebsite[]> {
  const listed = await bucket.list({ prefix: `${PREFIX}${uid}/`, limit: 1000 });
  const manifests = listed.objects.filter((object) => object.key.endsWith(`/${MANIFEST}`));
  const sizes = new Map(listed.objects.map((object) => [object.key, object.size]));
  const now = Date.now();
  const sites = await Promise.all(manifests.map(async (object) => {
    const raw = await bucket.get(object.key);
    const manifest = raw ? await raw.json<WebsiteManifest>().catch(() => null) : null;
    if (!manifest || manifest.uid !== uid || !validSlug(manifest.slug) || !Array.isArray(manifest.files)) return null;
    if (now >= manifest.expiresAt) return null;
    return {
      id: storageId(manifest.slug),
      name: `Published website · ${manifest.slug}`,
      createdAt: manifest.createdAt,
      expiresAt: manifest.expiresAt,
      // Size was added after the first release of temporary sites. Fall back to
      // the R2 listing so those older manifests still report their footprint.
      size: manifest.files.reduce(
        (total, file) => total + (typeof file.size === "number" ? file.size : sizes.get(keyFor(uid, manifest.slug, file.name)) ?? 0),
        0,
      ),
      type: "application/x-lofin-website" as const,
      kind: "website" as const,
      url: siteUrl(origin, uid, manifest.slug),
    };
  }));
  return sites.filter((site): site is StoredWebsite => site !== null);
}

/** Serves a public site only from its dedicated hostname, never from the app origin. */
export async function serveWebsite(request: Request, env: Env, url: URL, execution: ExecutionContext): Promise<Response | null> {
  if (url.hostname !== WEBSITE_HOST || request.method !== "GET" || url.pathname.startsWith("/api/")) return null;
  let parts: string[];
  try {
    parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    return new Response("Website not found.", { status: 404 });
  }
  if (parts.length < 2 || !validUid(parts[0]) || !validSlug(parts[1])) return new Response("Website not found.", { status: 404 });
  const [uid, slug, ...path] = parts;
  const bucket = env.ANNOUNCEMENT_ASSETS;
  if (!bucket) return new Response("Website publishing is unavailable.", { status: 503 });

  const rawManifest = await bucket.get(manifestKey(uid, slug));
  if (!rawManifest) return new Response("Website not found.", { status: 404 });
  const manifest = await rawManifest.json<WebsiteManifest>().catch(() => null);
  if (!manifest || manifest.uid !== uid || manifest.slug !== slug || !Array.isArray(manifest.files)) return new Response("Website not found.", { status: 404 });
  if (Date.now() >= manifest.expiresAt) {
    execution.waitUntil(deleteManifestSite(bucket, manifest));
    return new Response("This temporary Lofin website has expired.", { status: 410, headers: { "Cache-Control": "no-store" } });
  }

  const requested = path.join("/") || "index.html";
  if (!validFileName(requested) || !manifest.files.some((file) => file.name === requested)) return new Response("File not found.", { status: 404 });
  const object = await bucket.get(keyFor(uid, slug, requested));
  if (!object) return new Response("File not found.", { status: 404 });
  const isHtml = /\.html?$/i.test(requested);
  const body = isHtml
    ? preparePublishedHtml(await object.text(), manifest.files, uid, slug)
    : object.body;
  return new Response(body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? contentType(requested),
      "Cache-Control": "public, max-age=60, s-maxage=60",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

/** Hourly backstop so expired sites disappear even if nobody visits them again. */
export async function deleteExpiredWebsites(env: Env): Promise<void> {
  const bucket = env.ANNOUNCEMENT_ASSETS;
  if (!bucket) return;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: PREFIX, cursor, limit: 1000 });
    await Promise.all(page.objects.filter((object) => object.key.endsWith(`/${MANIFEST}`)).map(async (object) => {
      const raw = await bucket.get(object.key);
      const manifest = raw ? await raw.json<WebsiteManifest>().catch(() => null) : null;
      if (manifest && Date.now() >= manifest.expiresAt && validUid(manifest.uid) && validSlug(manifest.slug)) {
        await deleteManifestSite(bucket, manifest);
      }
    }));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
