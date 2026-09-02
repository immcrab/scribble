import type { AdapterParams } from "../types";
import { openAICompatibleStream, formatOpenAIMessages, MAX_OUTPUT_TOKENS } from "./base";

/**
 * Z.ai (Zhipu AI) — the GLM model family's first-party API. OpenAI-compatible
 * chat completions at https://api.z.ai/api/paas/v4/chat/completions, with the
 * raw "{id}.{secret}" API key sent straight through as a Bearer token (the
 * api.z.ai endpoint takes the key as-is — no JWT signing, unlike the older
 * open.bigmodel.cn SDK). GLM-4.6+ stream their thinking on `reasoning_content`,
 * which openAICompatibleStream already separates from the answer text.
 */
export async function zaiStreamChat({
  apiKey,
  model,
  messages,
  visionCapable,
  effort,
  clientContext,
}: AdapterParams): Promise<ReadableStream<Uint8Array>> {
  const formattedMessages = formatOpenAIMessages(messages, visionCapable, effort, clientContext);
  const res = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages: formattedMessages, stream: true, max_tokens: MAX_OUTPUT_TOKENS }),
  });

  if (!res.ok) {
    throw new Error(`Z.ai error ${res.status}: ${await res.text()}`);
  }
  return openAICompatibleStream(res);
}
