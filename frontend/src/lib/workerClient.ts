import type { ModelDef, Attachment, Effort, ToolCallRecord } from "../types";

export interface WireMessage {
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: Pick<Attachment, "name" | "type" | "dataUrl">[];
}

interface StreamChatParams {
  workerUrl: string;
  password?: string;
  model: ModelDef;
  messages: WireMessage[];
  signal: AbortSignal;
  /** Required when model.provider === "custom" — the user's own endpoint + key, forwarded to the Worker per-request. */
  customProvider?: { baseUrl: string; apiKey: string };
  effort?: Effort;
  /** Agent Mode's web-search toggle — see worker/src/index.ts. */
  webSearch?: boolean;
}

/** One line of the Worker's NDJSON stream protocol. */
type StreamEvent =
  | { delta: string }
  | { reasoning: string }
  | { toolCall: ToolCallRecord }
  | { done: true }
  | { error: string };

/** A single yielded chunk from streamChat — content is the answer text, reasoning is
 * the model's separately-streamed thinking (see worker/src/adapters/base.ts). */
export type StreamChunk =
  | { type: "content"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "toolCall"; toolCall: ToolCallRecord };

export class WorkerClientError extends Error {}

/**
 * Streams a chat completion through the Cloudflare Worker proxy. The Worker
 * normalizes every upstream provider (xKiro/Mistral/Gemini) into the
 * same newline-delimited JSON event stream, so the frontend never needs to
 * know provider-specific wire formats.
 */
export async function* streamChat(params: StreamChatParams): AsyncGenerator<StreamChunk> {
  const { workerUrl, password, model, messages, signal, customProvider, effort, webSearch } = params;
  if (!workerUrl) {
    throw new WorkerClientError(
      "No Worker URL configured. Open Settings and paste your Cloudflare Worker URL."
    );
  }
  if (model.provider === "custom" && !customProvider) {
    throw new WorkerClientError(
      `"${model.displayName}" needs its custom provider connection, but it's missing or was deleted — check Settings.`
    );
  }

  const res = await fetch(`${workerUrl.replace(/\/$/, "")}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(password ? { "X-Scribble-Password": password } : {}),
    },
    body: JSON.stringify({
      provider: model.provider,
      model: model.modelId,
      messages,
      visionCapable: model.supportsVision,
      ...(customProvider ? { customProvider } : {}),
      ...(effort ? { effort } : {}),
      ...(webSearch ? { webSearch } : {}),
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new WorkerClientError(text || `Worker request failed (${res.status})`);
  }
  if (!res.body) {
    throw new WorkerClientError("Worker response had no body.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;

      let event: StreamEvent;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      if ("error" in event) {
        throw new WorkerClientError(event.error);
      }
      if ("delta" in event) {
        yield { type: "content", text: event.delta };
      }
      if ("reasoning" in event) {
        yield { type: "reasoning", text: event.reasoning };
      }
      if ("toolCall" in event) {
        yield { type: "toolCall", toolCall: event.toolCall };
      }
      if ("done" in event) {
        return;
      }
    }
  }
}

export async function checkWorkerHealth(workerUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${workerUrl.replace(/\/$/, "")}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Short AI-generated sidebar title for a chat's opening message. Returns null on any
 * failure (no Worker URL, offline, rate-limited, etc.) — caller keeps its heuristic title. */
export async function generateChatTitle(workerUrl: string, password: string | undefined, prompt: string): Promise<string | null> {
  if (!workerUrl) return null;
  try {
    const res = await fetch(`${workerUrl.replace(/\/$/, "")}/api/chat/title`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(password ? { "X-Scribble-Password": password } : {}),
      },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return data.title?.trim() || null;
  } catch {
    return null;
  }
}
