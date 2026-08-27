import type { ClientContext, Effort, ModelDef } from "../types";
import type { StreamChunk, WireMessage } from "./workerClient";
import { WorkerClientError } from "./workerClient";

/**
 * Puter.js (https://js.puter.com/v2/) is an in-browser SDK, not an HTTP API we
 * proxy through the Worker: it ships its own auth (a one-time sign-in popup on
 * first use) and its own billing, so the request never touches our backend or
 * any of our provider keys. This mirrors workerClient's SYSTEM_PROMPT/effort
 * nudge (worker/src/adapters/base.ts) — duplicated rather than shared because
 * the frontend and Worker are separate deployables with no shared package.
 */
const SYSTEM_PROMPT =
  "You are Scribble, a friendly and helpful AI assistant. You can discuss any topic, help with coding, answer questions, brainstorm, and help the user learn. If you don't know something, say so. If a request is unsafe, refuse. Be concise unless the user wants detail. Format your replies with Markdown. Only give your model name if asked who you are.";

const EFFORT_NUDGE: Record<Effort, string> = {
  low: " Keep your reasoning brief — answer directly and concisely, without extended deliberation.",
  medium: " Think through the problem at a normal, practical depth before answering.",
  high: " Reason carefully and thoroughly before answering — check your work before responding.",
  extra: " Reason extensively, consider multiple angles, and double-check your work before answering.",
  ultra:
    " Reason as exhaustively and rigorously as possible — consider edge cases, verify every step, and only answer once you are confident it's correct.",
};

interface PuterChatChunk {
  type?: string;
  text?: string;
}

/** One entry from Puter's live model catalog (`puter.ai.listModels()`) — see
 * https://docs.puter.com/AI/listModels/. `name`/`context` are missing for some models. */
export interface PuterModelInfo {
  id: string;
  provider?: string;
  name?: string;
  aliases?: string[];
  context?: number;
  max_tokens?: number;
}

interface PuterSDK {
  ai: {
    chat(
      messages: { role: string; content: string }[],
      options: { model: string; stream: true }
    ): Promise<AsyncIterable<PuterChatChunk>>;
    listModels(provider?: string | null): Promise<PuterModelInfo[]>;
  };
  auth: {
    isSignedIn(): boolean;
    signIn(): Promise<unknown>;
    signOut(): void;
  };
}

declare global {
  interface Window {
    puter?: PuterSDK;
  }
}

const PUTER_SCRIPT_SRC = "https://js.puter.com/v2/";

let puterLoadPromise: Promise<PuterSDK> | null = null;

/** Injects the Puter SDK script tag at most once per page load and resolves once `window.puter` is ready. */
function loadPuter(): Promise<PuterSDK> {
  if (typeof window === "undefined") {
    return Promise.reject(new WorkerClientError("Puter is only available in the browser."));
  }
  if (window.puter) return Promise.resolve(window.puter);
  if (puterLoadPromise) return puterLoadPromise;

  puterLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PUTER_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.puter) resolve(window.puter);
      else reject(new WorkerClientError("Puter SDK loaded but window.puter is unavailable."));
    };
    script.onerror = () => {
      puterLoadPromise = null;
      reject(new WorkerClientError("Failed to load the Puter SDK from js.puter.com."));
    };
    document.head.appendChild(script);
  });
  return puterLoadPromise;
}

/**
 * Decodes a data-URL attachment down to inline text. Puter's message format
 * (like the other adapters' fallback) has no image-attachment support here,
 * so every attachment — image or not — is described as text; see
 * describeAttachment in worker/src/adapters/base.ts for the equivalent.
 */
function describeAttachment(att: NonNullable<WireMessage["attachments"]>[number]): string {
  const type = att.type || "";
  const name = att.name || "attachment";

  if (type.startsWith("text/") || type.includes("json") || type.includes("javascript") || type.includes("typescript") || type.includes("xml")) {
    const match = att.dataUrl?.match(/^data:[^;]*;base64,(.+)$/s);
    if (match) {
      try {
        const binary = atob(match[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const text = new TextDecoder("utf-8").decode(bytes);
        return `\n\n[Attached file: ${name}]\n\`\`\`\n${text}\n\`\`\``;
      } catch {
        // fall through to the "not readable" note below
      }
    }
  }

  return `\n\n[Attached file "${name}" (${type || "unknown type"}) — not readable by this model]`;
}

function buildMessages(messages: WireMessage[], effort?: Effort, clientContext?: ClientContext): { role: string; content: string }[] {
  let systemContent = SYSTEM_PROMPT;
  if (clientContext?.localTime) {
    systemContent +=
      ` The user's current local date and time is ${clientContext.localTime}` +
      (clientContext.timezone ? ` (timezone: ${clientContext.timezone})` : "") +
      `. Use this for anything time-relative — don't say you don't know the date.`;
  }
  if (clientContext?.location) {
    systemContent +=
      ` The user's approximate location is ${clientContext.location}. Use it only to make answers ` +
      `more relevant (local time, nearby places, units, etc.) — don't mention it unless it's relevant.`;
  }
  if (clientContext?.replyLanguage) {
    systemContent +=
      ` Always write your reply in ${clientContext.replyLanguage}, regardless of the language the user writes in,` +
      ` unless they explicitly ask for a different language.`;
  }
  if (effort) systemContent += EFFORT_NUDGE[effort];
  const result = [{ role: "system", content: systemContent }];
  for (const m of messages) {
    if (m.role === "system") continue; // ours takes precedence, same as the Worker adapters
    let content = m.content || "";
    for (const att of m.attachments ?? []) content += describeAttachment(att);
    result.push({ role: m.role, content });
  }
  return result;
}

/**
 * True once the user has completed Puter's own sign-in popup — checked
 * synchronously off `window.puter` so callers can gate the UI (e.g. warn
 * before the first Puter model pick) without forcing the SDK to load.
 */
export function isPuterSignedIn(): boolean {
  return typeof window !== "undefined" && !!window.puter?.auth?.isSignedIn();
}

/** Signs the user out of Puter.js. No-op if the SDK was never loaded (i.e. never signed in). */
export async function puterSignOut(): Promise<void> {
  if (typeof window === "undefined" || !window.puter) return;
  window.puter.auth.signOut();
}

let modelsCachePromise: Promise<PuterModelInfo[]> | null = null;

/**
 * Puter's full model catalog — 800+ models as of Aug 2026, way more than we want to
 * hardcode in config/models.ts, so ModelSelector's "Browse all Puter models" panel
 * fetches it live instead. Cached per page load (in-memory only) since the panel can be
 * opened and closed repeatedly without needing a fresh network round trip each time;
 * a failed fetch clears the cache so the next open retries instead of sticking with
 * an empty list.
 */
export function listPuterModels(): Promise<PuterModelInfo[]> {
  if (!modelsCachePromise) {
    modelsCachePromise = loadPuter()
      .then((puter) => puter.ai.listModels())
      .catch((err) => {
        modelsCachePromise = null;
        throw err;
      });
  }
  return modelsCachePromise;
}

/**
 * Streams a chat completion directly from the browser via Puter.js — no
 * Worker involved. Puter proxies to the real vendor (Anthropic/OpenAI/...)
 * under its own account, so this needs no API key of ours at all.
 */
export async function* puterStreamChat(params: {
  model: ModelDef;
  messages: WireMessage[];
  signal: AbortSignal;
  effort?: Effort;
  clientContext?: ClientContext;
}): AsyncGenerator<StreamChunk> {
  const { model, messages, signal, effort, clientContext } = params;
  if (signal.aborted) return;

  const puter = await loadPuter();
  const chatMessages = buildMessages(messages, effort, clientContext);

  let stream: AsyncIterable<PuterChatChunk>;
  try {
    stream = await puter.ai.chat(chatMessages, { model: model.modelId, stream: true });
  } catch (err) {
    throw new WorkerClientError(err instanceof Error ? err.message : "Puter request failed.");
  }

  let emittedAny = false;
  for await (const chunk of stream) {
    if (signal.aborted) return;
    if (chunk?.type === "error") {
      throw new WorkerClientError(chunk.text || "Puter returned an error.");
    }
    if (typeof chunk?.text === "string" && chunk.text) {
      emittedAny = true;
      yield { type: "content", text: chunk.text };
    }
  }
  if (!emittedAny) {
    throw new WorkerClientError("Model returned an empty response. Try again or pick a different model.");
  }
}
