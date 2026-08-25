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
import { searchWeb, shouldSearchWeb } from "./adapters/search";
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

          if (body.webSearch && env.SERP_API_KEY) {
            const lastUserIdx = messages.map((m, i) => ({ m, i })).filter((x) => x.m.role === "user").pop()?.i;
            const query = lastUserIdx !== undefined ? messages[lastUserIdx].content.trim() : "";
            // "webSearch" now means "auto" mode — decide per-turn instead of always
            // searching. A fast Groq classification keeps irrelevant turns (general
            // knowledge, coding, math) from paying the search latency/cost at all.
            // Fails open (search anyway) if the classifier call itself errors, or if
            // no Groq key is configured to run it.
            let worthSearching = true;
            if (query && env.GROQ_API_KEY) {
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
                    ? { ...m, content: `${m.content}\n\n[Web search results for "${query}":\n${resultsText}]` }
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
                  })
                : await ADAPTERS[body.provider]!({
                    apiKey: apiKey!,
                    model: body.model,
                    messages,
                    visionCapable: !!body.visionCapable,
                    effort: body.effort,
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
