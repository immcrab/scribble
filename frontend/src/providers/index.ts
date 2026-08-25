/**
 * Frontend-side provider abstraction. The UI never branches on `provider` —
 * every mode calls this single function with a ModelDef and gets a uniform
 * token stream back. Per-provider request shaping for xKiro/Mistral/
 * Gemini/OpenRouter lives server-side in worker/src/adapters, since that's
 * where the real API differences (auth headers, payload shape, SSE format)
 * live and where our provider keys are held. Puter is the one exception —
 * it's an in-browser SDK with its own auth/billing, so it's called directly
 * from lib/puterClient.ts, bypassing the Worker entirely.
 */
import { streamChat as workerStreamChat, checkWorkerHealth, WorkerClientError, type WireMessage, type StreamChunk } from "../lib/workerClient";
import { puterStreamChat } from "../lib/puterClient";
import type { ClientContext, Effort, ModelDef } from "../types";

interface StreamChatParams {
  workerUrl: string;
  password?: string;
  model: ModelDef;
  messages: WireMessage[];
  signal: AbortSignal;
  customProvider?: { baseUrl: string; apiKey: string };
  effort?: Effort;
  webSearch?: boolean;
  memoryEnabled?: boolean;
  clientContext?: ClientContext;
}

export async function* streamChat(params: StreamChatParams): AsyncGenerator<StreamChunk> {
  if (params.model.provider === "puter") {
    yield* puterStreamChat({
      model: params.model,
      messages: params.messages,
      signal: params.signal,
      effort: params.effort,
      clientContext: params.clientContext,
    });
    return;
  }
  yield* workerStreamChat(params);
}

export { checkWorkerHealth, WorkerClientError };
export type { WireMessage, StreamChunk };
