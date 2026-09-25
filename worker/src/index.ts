import type { ChatRequestBody, Env, Provider, ProviderAdapter } from "./types";
import { corsHeaders } from "./cors";
import { checkPassword } from "./auth";
import { isRateLimited } from "./ratelimit";
import { xkiroStreamChat } from "./adapters/xkiro";
import { mistralStreamChat } from "./adapters/mistral";
import { geminiStreamChat } from "./adapters/gemini";
import { openrouterStreamChat } from "./adapters/openrouter";
import { zaiStreamChat } from "./adapters/zai";
import { customStreamChat } from "./adapters/custom";
import { generateImage } from "./adapters/image";
import { generateXkiroImage, editXkiroImage } from "./adapters/xkiroImage";
import { generateXkiroSpeech, listXkiroVoices } from "./adapters/xkiroSpeech";
import { generateTitle } from "./adapters/title";
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
import { extractMemory, shouldRecallMemory } from "./adapters/memory";
import { handleSendVerification } from "./verifyEmail";
import { ndjsonLine } from "./adapters/base";
import { verifyFirebaseIdToken } from "./firebaseVerifyToken";

const ADMIN_EMAIL = "imcrabfr@gmail.com";

// "custom" isn't in here — it has no Worker secret; its key comes from the
// request body instead (see the dispatch branch in the handler below).
const ADAPTERS: Partial<Record<Provider, ProviderAdapter>> = {
  xkiro: xkiroStreamChat,
  mistral: mistralStreamChat,
  gemini: geminiStreamChat,
  openrouter: openrouterStreamChat,
  zai: zaiStreamChat,
};

const API_KEY_ENV: Partial<Record<Provider, keyof Env>> = {
  xkiro: "XKIRO_API_KEY",
  mistral: "MISTRAL_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  zai: "ZAI_API_KEY",
};

function json(body: unknown, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

const VALID_EFFORTS = ["low", "medium", "high", "extra", "ultra"];

function isValidBody(body: unknown): body is ChatRequestBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (!["xkiro", "mistral", "gemini", "openrouter", "zai", "custom"].includes(b.provider as string)) return false;
  if (typeof b.model !== "string" || !b.model) return false;
  if (!Array.isArray(b.messages) || b.messages.length === 0) return false;
  if (b.effort !== undefined && !VALID_EFFORTS.includes(b.effort as string)) return false;
  if (b.webSearch !== undefined && typeof b.webSearch !== "boolean") return false;
  if (b.memoryEnabled !== undefined && typeof b.memoryEnabled !== "boolean") return false;
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
  if (b.provider === "custom") {
    const cp = b.customProvider as Record<string, unknown> | undefined;
    if (!cp || typeof cp !== "object") return false;
    if (typeof cp.baseUrl !== "string" || !cp.baseUrl) return false;
    if (typeof cp.apiKey !== "string" || !cp.apiKey) return false;
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
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true }, 200, cors);
    }

    if (url.pathname === "/api/auth/send-verification" && request.method === "POST") {
      return handleSendVerification(request, env, cors);
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

    if (url.pathname === "/api/chat/stream" && request.method === "POST") {
      if (!checkPassword(request, env)) {
        return json({ error: "Invalid or missing Scribble password." }, 401, cors);
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
        return json({ error: "Request must include provider, model, and a non-empty messages array." }, 400, cors);
      }

      let apiKey = body.customProvider?.apiKey;
      if (body.provider !== "custom") {
        const configuredKey = env[API_KEY_ENV[body.provider]!];
        apiKey = typeof configuredKey === "string" ? configuredKey : undefined;
        if (!apiKey) {
          return json(
            { error: `${body.provider} is not configured on this Worker (missing API key secret).` },
            500,
            cors
          );
        }
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

          if (body.webSearch) {
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
            const wantsWeb = explicitlyRequestsWeb(query);
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
                const results = await searchWeb(env.XKIRO_API_KEY, searchQuery);
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
                        faviconUrl: r.faviconUrl,
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
          if (clientContext?.memories?.length && env.GROQ_API_KEY && query) {
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
          if (body.memoryEnabled && env.GROQ_API_KEY && query) {
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
            const upstream =
              body.provider === "custom"
                ? await customStreamChat({
                    apiKey: apiKey!,
                    baseUrl: body.customProvider!.baseUrl,
                    model: body.model,
                    messages,
                    visionCapable: !!body.visionCapable,
                    effort: body.effort,
                    clientContext,
                  })
                : await ADAPTERS[body.provider]!({
                    apiKey: apiKey!,
                    model: body.model,
                    messages,
                    visionCapable: !!body.visionCapable,
                    effort: body.effort,
                    clientContext,
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
        return json({ error: "Invalid or missing Scribble password." }, 401, cors);
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

      // Backend picker from the frontend's Image mode: "xkiro" or (default) "cloudflare".
      const imageProvider = b.provider === "xkiro" ? "xkiro" : "cloudflare";
      const requestedModel = typeof b.model === "string" ? b.model : undefined;

      try {
        if (imageProvider === "xkiro") {
          if (!env.XKIRO_API_KEY) {
            return json({ error: "xKiro image generation is not configured on this Worker (missing XKIRO_API_KEY)." }, 500, cors);
          }
          const result = await generateXkiroImage({
            apiKey: env.XKIRO_API_KEY,
            model: requestedModel,
            prompt: b.prompt,
            size: typeof b.size === "string" ? b.size : undefined,
          });
          return json(result, 200, cors);
        }

        if (!env.CF_ACCOUNT_ID || !env.CF_AI_TOKEN) {
          return json({ error: "Image generation is not configured on this Worker (missing Cloudflare AI credentials)." }, 500, cors);
        }
        const result = await generateImage({
          accountId: env.CF_ACCOUNT_ID,
          apiToken: env.CF_AI_TOKEN,
          model: requestedModel,
          prompt: b.prompt,
        });
        return json(result, 200, cors);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Image generation failed.";
        return json({ error: message }, 502, cors);
      }
    }

    if (url.pathname === "/api/image/edit" && request.method === "POST") {
      if (!checkPassword(request, env)) {
        return json({ error: "Invalid or missing Scribble password." }, 401, cors);
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
      // ~9MB of raw image once base64-decoded — matches the frontend's attach cap.
      if (b.image.length > 12_000_000) {
        return json({ error: "Source image is too large. Use one under about 9MB." }, 413, cors);
      }

      // Editing is xKiro-only; Cloudflare Workers AI has no edits endpoint.
      if (!env.XKIRO_API_KEY) {
        return json({ error: "Image editing is not configured on this Worker (missing XKIRO_API_KEY)." }, 500, cors);
      }

      try {
        const result = await editXkiroImage({
          apiKey: env.XKIRO_API_KEY,
          model: typeof b.model === "string" ? b.model : undefined,
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
        return json({ error: "Invalid or missing Scribble password." }, 401, cors);
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
        return json({ error: "Invalid or missing Scribble password." }, 401, cors);
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
      if (typeof b.voice !== "string" || !b.voice) {
        return json({ error: "Request must include a voice id." }, 400, cors);
      }
      if (!env.XKIRO_API_KEY) {
        return json({ error: "Text-to-speech is not configured on this Worker (missing XKIRO_API_KEY)." }, 500, cors);
      }

      const speed = typeof b.speed === "number" && b.speed >= 0.25 && b.speed <= 4 ? b.speed : undefined;

      try {
        const result = await generateXkiroSpeech({
          apiKey: env.XKIRO_API_KEY,
          input: b.input,
          voice: b.voice,
          format: typeof b.format === "string" ? b.format : undefined,
          speed,
        });
        return json(result, 200, cors);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Speech generation failed.";
        return json({ error: message }, 502, cors);
      }
    }

    if (url.pathname === "/api/chat/title" && request.method === "POST") {
      if (!checkPassword(request, env)) {
        return json({ error: "Invalid or missing Scribble password." }, 401, cors);
      }

      const clientKey = request.headers.get("CF-Connecting-IP") ?? "unknown";
      if (isRateLimited(clientKey)) {
        return json({ error: "Rate limit exceeded. Slow down and try again shortly." }, 429, cors);
      }

      if (!env.GROQ_API_KEY) {
        return json({ error: "Title generation is not configured on this Worker (missing Groq API key)." }, 500, cors);
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
        const title = await generateTitle({ apiKey: env.GROQ_API_KEY, prompt: b.prompt });
        return json({ title }, 200, cors);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Title generation failed.";
        return json({ error: message }, 502, cors);
      }
    }

    // Static assets are invoked after API handling. With run_worker_first this
    // keeps /api/* dynamic while allowing the Worker to host the React app,
    // deep links, and its static assets on the same custom domain.
    return env.ASSETS.fetch(request);
  },
};
