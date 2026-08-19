import type { ModelDef, Attachment } from "../types";

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
}

/** One line of the Worker's NDJSON stream protocol. */
type StreamEvent =
  | { delta: string }
  | { done: true }
  | { error: string };

export class WorkerClientError extends Error {}

/**
 * Streams a chat completion through the Cloudflare Worker proxy. The Worker
 * normalizes every upstream provider (xKiro/Groq/Mistral/Gemini) into the
 * same newline-delimited JSON event stream, so the frontend never needs to
 * know provider-specific wire formats.
 */
export async function* streamChat(params: StreamChatParams): AsyncGenerator<string> {
  const { workerUrl, password, model, messages, signal } = params;
  if (!workerUrl) {
    throw new WorkerClientError(
      "No Worker URL configured. Open Settings and paste your Cloudflare Worker URL."
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
        yield event.delta;
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
