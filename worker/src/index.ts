import type { ChatRequestBody, Env, Provider, ProviderAdapter } from "./types";
import { corsHeaders } from "./cors";
import { checkPassword } from "./auth";
import { isRateLimited } from "./ratelimit";
import { xkiroStreamChat } from "./adapters/xkiro";
import { mistralStreamChat } from "./adapters/mistral";
import { geminiStreamChat } from "./adapters/gemini";
import { openrouterStreamChat } from "./adapters/openrouter";
import { customStreamChat } from "./adapters/custom";
import { generateImage } from "./adapters/image";
import { generateTitle } from "./adapters/title";
import { searchWeb, shouldSearchWeb, looksLikeArithmetic, isOwnLocationAlreadyKnown } from "./adapters/search";
import { extractMemory, shouldRecallMemory } from "./adapters/memory";
import { ndjsonLine } from "./adapters/base";

// "custom" isn't in here — it has no Worker secret; its key comes from the
// request body instead (see the dispatch branch in the handler below).
const ADAPTERS: Partial<Record<Provider, ProviderAdapter>> = {
  xkiro: xkiroStreamChat,
  mistral: mistralStreamChat,
  gemini: geminiStreamChat,
  openrouter: openrouterStreamChat,
};

const API_KEY_ENV: Partial<Record<Provider, keyof Env>> = {
  xkiro: "XKIRO_API_KEY",
  mistral: "MISTRAL_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
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
  if (!["xkiro", "mistral", "gemini", "openrouter", "custom"].includes(b.provider as string)) return false;
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
        apiKey = env[API_KEY_ENV[body.provider]!];
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

          if (body.webSearch && env.SERP_API_KEY) {
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
            // spend SerpApi quota confirming a fact we already have.
            let worthSearching =
              !looksLikeArithmetic(query) && !isOwnLocationAlreadyKnown(query, body.clientContext?.location);
            if (query && worthSearching && env.GROQ_API_KEY) {
              try {
                worthSearching = await shouldSearchWeb(env.GROQ_API_KEY, query);
              } catch {
                worthSearching = true;
              }
            }
            if (query && worthSearching) {
              const toolId = crypto.randomUUID();
              controller.enqueue(
                ndjsonLine({ toolCall: { id: toolId, name: "Web search", status: "running", input: { query } } })
              );
              try {
                const results = await searchWeb(env.SERP_API_KEY, query);
                const resultsText = results.length
                  ? results.map((r, i) => `${i + 1}. ${r.title} — ${r.link}\n${r.snippet}`).join("\n\n")
                  : "No results found.";
                messages = messages.map((m, i) =>
                  i === lastUserIdx
                    ? {
                        ...m,
                        content: `${m.content}\n\n[Live web search results for "${query}" — use these to answer accurately:\n${resultsText}]`,
                      }
                    : m
                );
                controller.enqueue(
                  ndjsonLine({
                    toolCall: {
                      id: toolId,
                      name: "Web search",
                      status: "done",
                      input: { query },
                      output: `${results.length} result${results.length === 1 ? "" : "s"}`,
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
                      input: { query },
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

      if (!env.CF_ACCOUNT_ID || !env.CF_AI_TOKEN) {
        return json({ error: "Image generation is not configured on this Worker (missing Cloudflare AI credentials)." }, 500, cors);
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
        const result = await generateImage({
          accountId: env.CF_ACCOUNT_ID,
          apiToken: env.CF_AI_TOKEN,
          model: typeof b.model === "string" ? b.model : undefined,
          prompt: b.prompt,
        });
        return json(result, 200, cors);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Image generation failed.";
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

    return json({ error: "Not found." }, 404, cors);
  },
};
