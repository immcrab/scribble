import type { ChatRequestBody, Env, Provider, ProviderAdapter } from "./types";
import { corsHeaders } from "./cors";
import { checkPassword } from "./auth";
import { isCloudflareImageRateLimited, isRateLimited } from "./ratelimit";
import { xkiroStreamChat } from "./adapters/xkiro";
import { mistralStreamChat } from "./adapters/mistral";
import { geminiStreamChat } from "./adapters/gemini";
import { groqStreamChat } from "./adapters/groq";
import { openrouterStreamChat } from "./adapters/openrouter";
import { zaiStreamChat } from "./adapters/zai";
import { cloudflareStreamChat } from "./adapters/cloudflare";
import { generateImage } from "./adapters/image";
import { generateXkiroImage, editXkiroImage } from "./adapters/xkiroImage";
import { generateXkiroSpeech, listXkiroVoices } from "./adapters/xkiroSpeech";
import {
  searchWeb,
  shouldSearchWeb,
  buildSearchQuery,
  looksLikeArithmetic,
  isOwnLocationAlreadyKnown,
  explicitlyRequestsWeb,
  publicUrlIn,
  readWebPage,
} from "./adapters/search";
import { plainYouTubeQuery, searchYouTube, wantsYouTubeVideos, youtubeTitle, youtubeVideoIdIn, type YouTubeVideo } from "./adapters/youtube";
import { extractMemory, shouldRecallMemory } from "./adapters/memory";
import { ndjsonLine } from "./adapters/base";
import { verifyFirebaseIdToken } from "./firebaseVerifyToken";
import { verifyTurnstileToken } from "./turnstile";
import { handleAdminLibrary, handleLibrary, isAdminLibraryPath, isLibraryPath } from "./library";
import { deleteExpiredWebsites, handleWebsiteApi, serveWebsite } from "./websites";
import { FREE_XKIRO_MODEL_IDS } from "./freeXkiroModels";
import { FREE_PROVIDER_MODEL_IDS } from "./freeProviderModels";
import { handleMcpInspect } from "./mcp";
import { handleMcpAccountApi, isMcpAccountPath } from "./mcpRoutes";
import { runMcpAgentStep } from "./mcpAgent";

const ADMIN_EMAIL = "imcrabfr@gmail.com";
const FREE_XKIRO_IMAGE_MODEL = "sensenova/sensenova-u1.5-lite";
const FREE_CLOUDFLARE_IMAGE_MODELS = new Set([
  "@cf/black-forest-labs/flux-1-schnell",
  "@cf/lykon/dreamshaper-8-lcm",
  "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "@cf/bytedance/stable-diffusion-xl-lightning",
]);
// Keep image editing on the same free SenseNova backend as the image picker.
const XKIRO_EDIT_IMAGE_MODEL = FREE_XKIRO_IMAGE_MODEL;
const SPEECH_INPUT_MAX_CHARS = 4000;
const SPEECH_FORMATS = new Set(["mp3", "wav", "opus", "aac", "flac"]);

const ADAPTERS: Partial<Record<Provider, ProviderAdapter>> = {
  xkiro: xkiroStreamChat,
  mistral: mistralStreamChat,
  gemini: geminiStreamChat,
  groq: groqStreamChat,
  openrouter: openrouterStreamChat,
  zai: zaiStreamChat,
  cloudflare: cloudflareStreamChat,
};

function json(body: unknown, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

/**
 * Favicons are fetched through the Worker rather than from a student's browser.
 * School network filters often allow Lofin but block the separate third-party
 * favicon request, leaving an otherwise usable search result with a blank icon.
 */
function faviconUrl(origin: string, resultUrl: string): string | undefined {
  try {
    const hostname = new URL(resultUrl).hostname;
    return hostname ? `${origin}/api/favicon?domain=${encodeURIComponent(hostname)}` : undefined;
  } catch {
    return undefined;
  }
}

const FALLBACK_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#334155"/><circle cx="32" cy="32" r="19" fill="none" stroke="#cbd5e1" stroke-width="4"/><path d="M13 32h38M32 13c7 8 7 30 0 38M32 13c-7 8-7 30 0 38" fill="none" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/></svg>`;

function fallbackFaviconResponse(cors: HeadersInit): Response {
  return new Response(FALLBACK_FAVICON, {
    headers: { ...cors, "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
  });
}

const VALID_EFFORTS = ["low", "medium", "high", "extra", "ultra"];

function isValidBody(body: unknown): body is ChatRequestBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (!["xkiro", "mistral", "gemini", "groq", "openrouter", "zai", "cloudflare"].includes(b.provider as string)) return false;
  if (typeof b.model !== "string" || !b.model) return false;
  const provider = b.provider as keyof typeof FREE_PROVIDER_MODEL_IDS | "xkiro";
  if (provider === "xkiro" ? !FREE_XKIRO_MODEL_IDS.has(b.model) : !FREE_PROVIDER_MODEL_IDS[provider].has(b.model)) return false;
  if (!Array.isArray(b.messages) || b.messages.length === 0) return false;
  if (b.effort !== undefined && !VALID_EFFORTS.includes(b.effort as string)) return false;
  if (b.webSearch !== undefined && typeof b.webSearch !== "boolean") return false;
  if (b.forceWebSearch !== undefined && typeof b.forceWebSearch !== "boolean") return false;
  if (b.memoryEnabled !== undefined && typeof b.memoryEnabled !== "boolean") return false;
  if (b.connectedTools !== undefined && typeof b.connectedTools !== "boolean") return false;
  if (b.clientContext !== undefined) {
    if (typeof b.clientContext !== "object" || b.clientContext === null) return false;
    const cc = b.clientContext as Record<string, unknown>;
    if (cc.localTime !== undefined && typeof cc.localTime !== "string") return false;
    if (cc.timezone !== undefined && typeof cc.timezone !== "string") return false;
    if (cc.location !== undefined && typeof cc.location !== "string") return false;
    if (cc.customSystemPrompt !== undefined && typeof cc.customSystemPrompt !== "string") return false;
    if (cc.memories !== undefined && (!Array.isArray(cc.memories) || !cc.memories.every((m) => typeof m === "string"))) return false;
    if (cc.replyLanguage !== undefined && typeof cc.replyLanguage !== "string") return false;
  }
  return b.messages.every(
    (m) =>
      m &&
      typeof m === "object" &&
      ["user", "assistant", "system"].includes((m as Record<string, unknown>).role as string) &&
      (typeof (m as Record<string, unknown>).content === "string" ||
        Array.isArray((m as Record<string, unknown>).attachments))
  );
}

export default {
  async fetch(request: Request, env: Env, execution: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    // User-created pages get their own origin, so generated markup can never
    // access Lofin's application-origin data. This runs before static assets.
    const publicSite = await serveWebsite(request, env, url, execution);
    if (publicSite) return publicSite;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true }, 200, cors);
    }

    // Server setup is intentionally an inspection endpoint, not an open proxy.
    // It only performs MCP initialize/tools-list against public HTTPS hosts.
    if (url.pathname === "/api/mcp/inspect" && request.method === "POST") {
      if (!checkPassword(request, env)) {
        return json({ error: "Invalid or missing Lofin password." }, 401, cors);
      }
      const clientKey = request.headers.get("CF-Connecting-IP") ?? "unknown";
      if (isRateLimited(clientKey)) {
        return json({ error: "Rate limit exceeded. Slow down and try again shortly." }, 429, cors);
      }
      return handleMcpInspect(request, env, cors, json);
    }

    // Composio OAuth connections and Agent tool access. Firebase-token gated; see mcpRoutes.ts.
    if (isMcpAccountPath(url.pathname)) {
      return handleMcpAccountApi(request, env, url, cors, json);
    }

    // Google serves a compact favicon for nearly any public hostname. Proxy it
    // so a filtered client network only needs to load an image from Lofin.
    if (url.pathname === "/api/favicon" && request.method === "GET") {
      const domain = url.searchParams.get("domain")?.trim().toLowerCase() ?? "";
      if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
        return fallbackFaviconResponse(cors);
      }

      const cacheKey = new Request(url.toString());
      try {
        const cached = await caches.default.match(cacheKey);
        if (cached) return cached;

        const googleUrl = new URL("https://www.google.com/s2/favicons");
        googleUrl.searchParams.set("domain", domain);
        googleUrl.searchParams.set("sz", "64");
        const upstream = await fetch(googleUrl, { headers: { Accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8" } });
        const contentType = upstream.headers.get("Content-Type") ?? "";
        const contentLength = Number(upstream.headers.get("Content-Length") ?? 0);
        if (!upstream.ok || !contentType.startsWith("image/") || contentLength > 512 * 1024) return fallbackFaviconResponse(cors);

        const response = new Response(upstream.body, {
          headers: { ...cors, "Content-Type": contentType, "Cache-Control": "public, max-age=604800, s-maxage=2592000" },
        });
        await caches.default.put(cacheKey, response.clone());
        return response;
      } catch {
        // A neutral icon is better than a broken image if Google or the cache is unavailable.
        return fallbackFaviconResponse(cors);
      }
    }

    // Site-wide bot check: the browser posts the Turnstile token here before the app loads.
    // The secret never leaves the Worker.
    if (url.pathname === "/api/turnstile/verify" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
      if (!(await verifyTurnstileToken(body?.token, request, env))) {
        return json({ error: "Verification failed. Please try again." }, 403, cors);
      }
      return json({ ok: true }, 200, cors);
    }

    // Product artwork belongs in R2, not in the shared RTDB JSON catalog. The catalog only
    // stores the public URL returned here. This endpoint is deliberately admin-only even if
    // someone discovers the worker URL, and it stays unavailable until the R2 binding/domain
    // are configured (see wrangler.toml).
    if (url.pathname === "/api/admin/announcement-image" && request.method === "POST") {
      if (!env.ANNOUNCEMENT_ASSETS || !env.FIREBASE_PROJECT_ID) {
        return json({ error: "Announcement uploads are not configured. Add the R2 binding to the Worker." }, 503, cors);
      }
      const auth = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
      if (!auth) return json({ error: "Sign in as an admin to upload artwork." }, 401, cors);
      try {
        const claims = await verifyFirebaseIdToken(auth, env.FIREBASE_PROJECT_ID);
        if (claims.email !== ADMIN_EMAIL || !claims.emailVerified) return json({ error: "Admin access required." }, 403, cors);
      } catch {
        return json({ error: "Your sign-in expired. Please sign in again." }, 401, cors);
      }
      const type = request.headers.get("Content-Type")?.split(";")[0] ?? "";
      const len = Number(request.headers.get("Content-Length") ?? 0);
      if (!type.startsWith("image/") || (len && len > 5 * 1024 * 1024)) return json({ error: "Upload a supported image under 5 MB." }, 400, cors);
      const body = await request.arrayBuffer();
      if (!body.byteLength || body.byteLength > 5 * 1024 * 1024) return json({ error: "Upload a supported image under 5 MB." }, 400, cors);
      const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : type === "image/gif" ? "gif" : "jpg";
      const key = `announcements/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      await env.ANNOUNCEMENT_ASSETS.put(key, body, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
      // The Worker serves this public, unguessable object URL below. This avoids a
      // second R2 custom-domain prerequisite while keeping assets cacheable.
      return json({ url: `${url.origin}/api/announcement-image/${key}` }, 201, cors);
    }

    if (url.pathname.startsWith("/api/announcement-image/") && request.method === "GET") {
      if (!env.ANNOUNCEMENT_ASSETS) return json({ error: "Announcement asset storage is unavailable." }, 503, cors);
      const key = url.pathname.slice("/api/announcement-image/".length);
      if (!key.startsWith("announcements/") || key.includes("..")) return json({ error: "Invalid asset path." }, 400, cors);
      const object = await env.ANNOUNCEMENT_ASSETS.get(key);
      if (!object) return json({ error: "Image not found." }, 404, cors);
      return new Response(object.body, { headers: { ...cors, "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream", "Cache-Control": object.httpMetadata?.cacheControl ?? "public, max-age=31536000, immutable" } });
    }

    // Admin-only inspection of per-user library objects. This comes before the
    // normal library route because the latter only permits the caller's own uid.
    if (isAdminLibraryPath(url.pathname)) {
      return handleAdminLibrary(request, env, url, cors, json);
    }

    // Per-user saved images (R2, private, Firebase-token gated) — see library.ts.
    if (isLibraryPath(url.pathname)) {
      return handleLibrary(request, env, url, cors, json);
    }

    if (url.pathname === "/api/websites") {
      return handleWebsiteApi(request, env, url, cors, json);
    }

    if (url.pathname === "/api/chat/stream" && request.method === "POST") {
      if (!checkPassword(request, env)) {
        return json({ error: "Invalid or missing Lofin password." }, 401, cors);
      }

      const clientKey = request.headers.get("CF-Connecting-IP") ?? "unknown";
      if (isRateLimited(clientKey)) {
        return json({ error: "Rate limit exceeded. Slow down and try again shortly." }, 429, cors);
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Malformed JSON body." }, 400, cors);
      }

      if (!isValidBody(body)) {
        return json({ error: "Request must use a listed free model and include a non-empty messages array." }, 400, cors);
      }

      const apiKeys: Record<Exclude<Provider, "custom">, string | undefined> = {
        xkiro: env.XKIRO_API_KEY,
        mistral: env.MISTRAL_API_KEY,
        gemini: env.GEMINI_API_KEY,
        groq: env.GROQ_API_KEY,
        openrouter: env.OPENROUTER_API_KEY,
        zai: env.ZAI_API_KEY,
        cloudflare: env.CF_AI_TOKEN,
      };
      // isValidBody has already excluded the client-supplied "custom" provider.
      const provider = body.provider as Exclude<Provider, "custom">;
      const apiKey = typeof apiKeys[provider] === "string" ? apiKeys[provider] : undefined;
      if (!apiKey) {
        return json(
          { error: `${provider} is not configured on this Worker (missing API key secret).` },
          500,
          cors
        );
      }

      // Built lazily inside the stream (rather than awaited up front) so a
      // `toolCall: running` event reaches the client the instant the search
      // starts, not only once it — and the whole request — has finished.
      const responseStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let messages = body.messages;
          let clientContext = body.clientContext;

          const lastUserIdx = messages.map((m, i) => ({ m, i })).filter((x) => x.m.role === "user").pop()?.i;
          const query = lastUserIdx !== undefined ? messages[lastUserIdx].content.trim() : "";

          // Agent Mode only: use the signed-in user's connected Composio accounts (see mcpAgent.ts).
          // Side-effecting actions are never run here; they become a confirmation card.
          let mcpHandled = false;
          if (body.connectedTools && env.FIREBASE_PROJECT_ID && lastUserIdx !== undefined) {
            const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
            let toolUid: string | null = null;
            if (token) {
              try {
                toolUid = (await verifyFirebaseIdToken(token, env.FIREBASE_PROJECT_ID)).uid;
              } catch {
                toolUid = null;
              }
            }
            if (!toolUid) console.warn("mcp agent", "no-verified-user", JSON.stringify({ hadToken: !!token }));
            if (toolUid) {
              const priorTurns = messages.slice(Math.max(0, lastUserIdx - 4), lastUserIdx).map((m) => `${m.role}: ${m.content.slice(0, 400)}`).join("\n");
              // Search tools against this request plus the user's recent messages, so a short follow-up
              // ("public, no readme") still finds the tool the conversation is about.
              const earlierUser = messages.slice(0, lastUserIdx).filter((m) => m.role === "user").slice(-2).map((m) => m.content.slice(0, 400));
              const searchText = [...earlierUser, query].join(" ");
              const { note, capability, handled } = await runMcpAgentStep(env, toolUid, query, searchText, priorTurns, (toolCall) => controller.enqueue(ndjsonLine({ toolCall })));
              mcpHandled = handled;
              if (note) messages = messages.map((m, i) => (i === lastUserIdx ? { ...m, content: `${m.content}\n\n${note}` } : m));
              // Tell the model what Agent mode can do on the user's accounts (system prompt, not chat text).
              if (capability) clientContext = { ...clientContext, customSystemPrompt: [capability, clientContext?.customSystemPrompt].filter(Boolean).join("\n\n") };
            }
          }

          // Web search is provider-independent: Exa supplies results when its
          // key is configured and the keyless fallback keeps the capability
          // available otherwise. Memory remains independently disabled below.
          const useWebSearch = true;
          const useMemory = false;
          // The setting enables automatic research. An unambiguous request to
          // search, browse, or inspect a URL should still work when automatic
          // search is off: that is an explicit, per-turn instruction from the
          // user rather than an automatic lookup.
          const userRequestedWeb = explicitlyRequestsWeb(query);

          // Video requests ("find me a react tutorial", "youtube videos about X", "more
          // like this <link>") get a YouTube search whose results the chat renders as a
          // small player window. That replaces the generic web search for the turn.
          let youtubeHandled = false;
          if (!mcpHandled && lastUserIdx !== undefined && query && wantsYouTubeVideos(query)) {
            const toolId = crypto.randomUUID();
            const pastedId = youtubeVideoIdIn(query);
            let searchQuery = "";
            if (pastedId) searchQuery = (await youtubeTitle(pastedId)) ?? "";
            if (!searchQuery && env.GROQ_API_KEY) {
              try {
                searchQuery = await buildSearchQuery(
                  env.GROQ_API_KEY,
                  query,
                  messages.slice(0, lastUserIdx).map((m) => ({ role: m.role, content: m.content }))
                );
              } catch {
                searchQuery = "";
              }
            }
            searchQuery = (searchQuery || plainYouTubeQuery(query) || query).replace(/\byoutube\b/gi, " ").replace(/\s+/g, " ").trim().slice(0, 200);
            controller.enqueue(ndjsonLine({ toolCall: { id: toolId, name: "YouTube search", status: "running", input: { query: searchQuery } } }));
            try {
              const found = await searchYouTube(searchQuery);
              const videos: YouTubeVideo[] = pastedId
                ? [{ id: pastedId, title: searchQuery, channel: "" }, ...found.filter((v) => v.id !== pastedId)]
                : found;
              const listing = videos
                .map((v, i) => `${i + 1}. ${v.title}${v.channel ? ` — ${v.channel}` : ""}${v.duration ? ` (${v.duration})` : ""}`)
                .join("\n");
              messages = messages.map((m, i) =>
                i === lastUserIdx
                  ? {
                      ...m,
                      content: `${m.content}\n\n[YouTube videos found for "${searchQuery}". The chat is already showing them to the user in a video window, so refer to them by title, briefly say which fit best, and do not paste links or invent other videos:\n${listing}]`,
                    }
                  : m
              );
              controller.enqueue(
                ndjsonLine({
                  toolCall: {
                    id: toolId,
                    name: "YouTube search",
                    status: "done",
                    input: { query: searchQuery },
                    output: `${videos.length} video${videos.length === 1 ? "" : "s"}`,
                    videos,
                  },
                })
              );
              youtubeHandled = true;
            } catch (err) {
              controller.enqueue(
                ndjsonLine({
                  toolCall: {
                    id: toolId,
                    name: "YouTube search",
                    status: "error",
                    input: { query: searchQuery },
                    output: err instanceof Error ? err.message : "YouTube search failed.",
                  },
                })
              );
            }
          }

          if (useWebSearch && !mcpHandled && !youtubeHandled && (body.webSearch || userRequestedWeb)) {
            const pageUrl = publicUrlIn(query);
            if (pageUrl && lastUserIdx !== undefined) {
              const toolId = crypto.randomUUID();
              controller.enqueue(ndjsonLine({ toolCall: { id: toolId, name: "Fetch webpage", status: "running", input: { url: pageUrl } } }));
              try {
                const page = await readWebPage(env.XKIRO_API_KEY, pageUrl);
                messages = messages.map((m, i) =>
                  i === lastUserIdx
                    ? { ...m, content: `${m.content}\n\n[Live webpage content from ${pageUrl} (${page.title}) — use this to answer accurately:\n${page.text}]` }
                    : m
                );
                controller.enqueue(
                  ndjsonLine({
                    toolCall: { id: toolId, name: "Fetch webpage", status: "done", input: { url: pageUrl }, output: page.title },
                  })
                );
              } catch (err) {
                controller.enqueue(
                  ndjsonLine({
                    toolCall: {
                      id: toolId,
                      name: "Fetch webpage",
                      status: "error",
                      input: { url: pageUrl },
                      output: err instanceof Error ? err.message : "Website read failed.",
                    },
                  })
                );
              }
            }
            // "webSearch" now means "auto" mode — decide per-turn instead of always
            // searching. A fast Groq classification keeps irrelevant turns (general
            // knowledge, coding, math) from paying the search latency/cost at all.
            // Fails open (search anyway) if the classifier call itself errors, or if
            // no Groq key is configured to run it.
            // A pure digits/operators string (plain arithmetic, or just numeric-looking
            // noise) is never worth a search — skip it before ever asking the classifier,
            // since a short garbled number-like string reads as ambiguous to a cheap
            // model and can get misjudged as a lookup-worthy ID/serial number. Likewise,
            // "where am I" style questions are already answered by clientContext.location
            // (IP-derived, see frontend/src/lib/clientContext.ts) — searching would just
            // spend search quota confirming a fact we already have.
            // A person can explicitly ask to preview a site; treat that as a
            // lookup even if the general-purpose classifier would have judged
            // the short request as conversational rather than factual.
            const wantsWeb = userRequestedWeb || body.forceWebSearch === true;
            let worthSearching =
              !looksLikeArithmetic(query) && !isOwnLocationAlreadyKnown(query, body.clientContext?.location);
            if (wantsWeb) worthSearching = true;
            if (query && worthSearching && env.GROQ_API_KEY && !wantsWeb) {
              try {
                worthSearching = await shouldSearchWeb(env.GROQ_API_KEY, query);
              } catch {
                worthSearching = true;
              }
            }
            if (query && worthSearching && !pageUrl) {
              const toolId = crypto.randomUUID();
              // Reformulate a conversational query only when it is safe to do so.
              // For fresh/current questions, the user's exact wording is already a
              // strong query and a rewriter can accidentally invent candidate
              // answers (for example adding model names to "latest AI model").
              // Preserve it verbatim so the search engine, not a helper model,
              // decides what is current.
              let searchQuery = query;
              const asksForCurrentInfo = /\b(?:latest|newest|current|today|right now|recent|recently|this week|this month|this year)\b/i.test(query);
              if (env.GROQ_API_KEY && !asksForCurrentInfo) {
                try {
                  searchQuery = await buildSearchQuery(
                    env.GROQ_API_KEY,
                    query,
                    messages.slice(0, lastUserIdx).map((m) => ({ role: m.role, content: m.content }))
                  );
                } catch {
                  searchQuery = query;
                }
              }
              controller.enqueue(
                ndjsonLine({
                  toolCall: { id: toolId, name: "Web search", status: "running", input: { query: searchQuery } },
                })
              );
              try {
                const results = await searchWeb(env.EXA_API_KEY, searchQuery);
                const resultsText = results.length
                  ? results.map((r, i) => `${i + 1}. ${r.title} — ${r.link}\n${r.snippet}`).join("\n\n")
                  : "No results found.";
                messages = messages.map((m, i) =>
                  i === lastUserIdx
                    ? {
                        ...m,
                        content: `${m.content}\n\n[Live web search results for "${searchQuery}" — use these to answer accurately:\n${resultsText}]`,
                      }
                    : m
                );
                controller.enqueue(
                  ndjsonLine({
                    toolCall: {
                      id: toolId,
                      name: "Web search",
                      status: "done",
                      input: { query: searchQuery },
                      output: `${results.length} result${results.length === 1 ? "" : "s"}`,
                      previews: results.map((r) => ({
                        title: r.title,
                        url: r.link,
                        snippet: r.snippet,
                        thumbnailUrl: r.thumbnailUrl,
                        // Never expose the search provider's icon URL directly:
                        // filtered school networks frequently block those image hosts.
                        faviconUrl: faviconUrl(url.origin, r.link),
                      })),
                    },
                  })
                );
              } catch (err) {
                controller.enqueue(
                  ndjsonLine({
                    toolCall: {
                      id: toolId,
                      name: "Web search",
                      status: "error",
                      input: { query: searchQuery },
                      output: err instanceof Error ? err.message : "Search failed.",
                    },
                  })
                );
              }
            }
          }

          // Memory recall: don't unconditionally inject stored facts (and show a "Memory
          // recall" badge) on every single turn once any memory exists — ask a fast Groq
          // classifier whether this specific turn would actually benefit from them. Fails
          // open (keeps the facts in) if the classifier call itself errors, since leaving
          // harmless context in is safer than silently dropping it.
          if (useMemory && clientContext?.memories?.length && env.GROQ_API_KEY && query) {
            try {
              const relevant = await shouldRecallMemory(env.GROQ_API_KEY, query, clientContext.memories);
              if (relevant) {
                const n = clientContext.memories.length;
                controller.enqueue(
                  ndjsonLine({
                    toolCall: {
                      id: crypto.randomUUID(),
                      name: "Memory recall",
                      status: "done",
                      input: {},
                      output: `${n} memor${n === 1 ? "y" : "ies"}`,
                    },
                  })
                );
              } else {
                clientContext = { ...clientContext, memories: undefined };
              }
            } catch {
              // classifier failed — leave the memories in (fail open), just skip the badge
            }
          }

          // Memory write: decide whether this message contains something worth remembering.
          // Only emit a tool-call event when there's actually a fact to show — most turns
          // yield nothing, and a badge for every "nothing to remember" turn (or a spinner
          // that has to resolve to a no-op) would be noise rather than signal.
          if (useMemory && body.memoryEnabled && env.GROQ_API_KEY && query) {
            try {
              const fact = await extractMemory(env.GROQ_API_KEY, query);
              if (fact) {
                controller.enqueue(
                  ndjsonLine({
                    toolCall: { id: crypto.randomUUID(), name: "Memory", status: "done", input: {}, output: fact },
                  })
                );
              }
            } catch {
              // classifier failed — skip remembering this turn rather than surfacing an error
              // for a background, best-effort feature
            }
          }

          try {
            const adapter = ADAPTERS[provider];
            if (!adapter) throw new Error(`No adapter is configured for ${provider}.`);
            const upstream = await adapter({
              apiKey,
              model: body.model,
              messages,
              visionCapable: !!body.visionCapable,
              effort: body.effort,
              clientContext,
              accountId: provider === "cloudflare" ? env.CF_ACCOUNT_ID : undefined,
            });
            const reader = upstream.getReader();
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : "Upstream provider request failed.";
            controller.enqueue(ndjsonLine({ error: message }));
            controller.enqueue(ndjsonLine({ done: true }));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(responseStream, {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (url.pathname === "/api/image/generate" && request.method === "POST") {
      if (!checkPassword(request, env)) {
        return json({ error: "Invalid or missing Lofin password." }, 401, cors);
      }

      const clientKey = request.headers.get("CF-Connecting-IP") ?? "unknown";
      if (isRateLimited(clientKey)) {
        return json({ error: "Rate limit exceeded. Slow down and try again shortly." }, 429, cors);
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Malformed JSON body." }, 400, cors);
      }

      const b = body as Record<string, unknown>;
      if (!b || typeof b.prompt !== "string" || !b.prompt.trim()) {
        return json({ error: "Request must include a non-empty prompt." }, 400, cors);
      }

      try {
        if (b.provider === "xkiro") {
          if (b.model !== FREE_XKIRO_IMAGE_MODEL) {
            return json({ error: "Only the free xKiro SenseNova U1.5 Lite image model is available." }, 400, cors);
          }
          if (!env.XKIRO_API_KEY) {
            return json({ error: "xKiro image generation is not configured on this Worker (missing XKIRO_API_KEY)." }, 500, cors);
          }
          const result = await generateXkiroImage({
            apiKey: env.XKIRO_API_KEY,
            model: FREE_XKIRO_IMAGE_MODEL,
            prompt: b.prompt,
            size: typeof b.size === "string" ? b.size : undefined,
          });
          return json(result, 200, cors);
        }

        if (b.model !== undefined && (typeof b.model !== "string" || !FREE_CLOUDFLARE_IMAGE_MODELS.has(b.model))) {
          return json({ error: "Request must use a listed free Cloudflare image model." }, 400, cors);
        }
        if (b.provider !== undefined && b.provider !== "cloudflare") {
          return json({ error: "Unsupported image provider." }, 400, cors);
        }
        if (isCloudflareImageRateLimited(clientKey)) {
          return json({ error: "Cloudflare image limit reached. Please wait a minute before generating another image." }, 429, cors);
        }
        if (!env.CF_ACCOUNT_ID || !env.CF_AI_TOKEN) {
          return json({ error: "Cloudflare Flux is not configured on this Worker (missing Cloudflare AI credentials)." }, 500, cors);
        }
        const result = await generateImage({
          accountId: env.CF_ACCOUNT_ID,
          apiToken: env.CF_AI_TOKEN,
          model: typeof b.model === "string" ? b.model : undefined,
          prompt: b.prompt,
          options: {
            negativePrompt: typeof b.negativePrompt === "string" ? b.negativePrompt : undefined,
            steps: typeof b.steps === "number" ? b.steps : undefined,
            seed: typeof b.seed === "number" ? b.seed : undefined,
            width: typeof b.width === "number" ? b.width : undefined,
            height: typeof b.height === "number" ? b.height : undefined,
          },
        });
        return json(result, 200, cors);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Image generation failed.";
        return json({ error: message }, 502, cors);
      }
    }

    if (url.pathname === "/api/image/edit" && request.method === "POST") {
      if (!checkPassword(request, env)) {
        return json({ error: "Invalid or missing Lofin password." }, 401, cors);
      }

      const clientKey = request.headers.get("CF-Connecting-IP") ?? "unknown";
      if (isRateLimited(clientKey)) {
        return json({ error: "Rate limit exceeded. Slow down and try again shortly." }, 429, cors);
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Malformed JSON body." }, 400, cors);
      }

      const b = body as Record<string, unknown>;
      if (!b || typeof b.prompt !== "string" || !b.prompt.trim()) {
        return json({ error: "Request must include a non-empty prompt." }, 400, cors);
      }
      if (typeof b.image !== "string" || !b.image.startsWith("data:")) {
        return json({ error: "Request must include the source image as a data: URL." }, 400, cors);
      }
      if (b.model !== undefined && b.model !== XKIRO_EDIT_IMAGE_MODEL) {
        return json({ error: "Unsupported image editing model." }, 400, cors);
      }
      // About 9 MB after base64 decoding, matching the frontend upload limit.
      if (b.image.length > 12_000_000) {
        return json({ error: "Source image is too large. Use one under about 9MB." }, 413, cors);
      }
      if (!env.XKIRO_API_KEY) {
        return json({ error: "Image editing is not configured on this Worker (missing XKIRO_API_KEY)." }, 500, cors);
      }

      try {
        const result = await editXkiroImage({
          apiKey: env.XKIRO_API_KEY,
          model: XKIRO_EDIT_IMAGE_MODEL,
          prompt: b.prompt,
          size: typeof b.size === "string" ? b.size : undefined,
          imageDataUrl: b.image,
        });
        return json(result, 200, cors);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Image editing failed.";
        return json({ error: message }, 502, cors);
      }
    }

    if (url.pathname === "/api/speech/voices" && request.method === "GET") {
      if (!checkPassword(request, env)) {
        return json({ error: "Invalid or missing Lofin password." }, 401, cors);
      }

      try {
        const voices = await listXkiroVoices(url.searchParams.toString());
        return new Response(JSON.stringify(voices), {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Fetching voices failed.";
        return json({ error: message }, 502, cors);
      }
    }

    if (url.pathname === "/api/speech/generate" && request.method === "POST") {
      if (!checkPassword(request, env)) {
        return json({ error: "Invalid or missing Lofin password." }, 401, cors);
      }

      const clientKey = request.headers.get("CF-Connecting-IP") ?? "unknown";
      if (isRateLimited(clientKey)) {
        return json({ error: "Rate limit exceeded. Slow down and try again shortly." }, 429, cors);
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Malformed JSON body." }, 400, cors);
      }

      const b = body as Record<string, unknown>;
      if (!b || typeof b.input !== "string" || !b.input.trim()) {
        return json({ error: "Request must include a non-empty input string." }, 400, cors);
      }
      if (b.input.length > SPEECH_INPUT_MAX_CHARS) {
        return json({ error: `Input must be at most ${SPEECH_INPUT_MAX_CHARS} characters.` }, 400, cors);
      }
      if (typeof b.voice !== "string" || !b.voice.trim()) {
        return json({ error: "Request must include a voice id." }, 400, cors);
      }
      if (b.format !== undefined && (typeof b.format !== "string" || !SPEECH_FORMATS.has(b.format))) {
        return json({ error: "Unsupported speech format." }, 400, cors);
      }
      if (b.speed !== undefined && (typeof b.speed !== "number" || !Number.isFinite(b.speed) || b.speed < 0.25 || b.speed > 4)) {
        return json({ error: "Speech speed must be between 0.25 and 4." }, 400, cors);
      }
      if (!env.XKIRO_API_KEY) {
        return json({ error: "Text-to-speech is not configured on this Worker (missing XKIRO_API_KEY)." }, 500, cors);
      }

      try {
        const result = await generateXkiroSpeech({
          apiKey: env.XKIRO_API_KEY,
          input: b.input,
          voice: b.voice,
          format: b.format,
          speed: b.speed,
        });
        return json(result, 200, cors);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Speech generation failed.";
        return json({ error: message }, 502, cors);
      }
    }

    if (url.pathname === "/api/chat/title" && request.method === "POST") {
      return json({ error: "Automatic titles are unavailable because they require a paid model." }, 410, cors);
    }

    // Static assets are invoked after API handling. With run_worker_first this
    // keeps /api/* dynamic while allowing the Worker to host the React app,
    // deep links, and its static assets on the same custom domain.
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller: ScheduledController, env: Env, execution: ExecutionContext): Promise<void> {
    execution.waitUntil(deleteExpiredWebsites(env));
  },
};
