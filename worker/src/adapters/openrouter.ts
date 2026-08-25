import type { AdapterParams } from "../types";
import { openAICompatibleStream, formatOpenAIMessages, MAX_OUTPUT_TOKENS } from "./base";

/** OpenRouter is OpenAI-compatible — https://openrouter.ai/api/v1/chat/completions
 * Model ids are namespaced by upstream provider, e.g. "openai/gpt-4o", "anthropic/claude-sonnet-4.5". */
export async function openrouterStreamChat({ apiKey, model, messages, visionCapable, effort, clientContext }: AdapterParams): Promise<ReadableStream<Uint8Array>> {
  const formattedMessages = formatOpenAIMessages(messages, visionCapable, effort, clientContext);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages: formattedMessages, stream: true, max_tokens: MAX_OUTPUT_TOKENS }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  }
  return openAICompatibleStream(res);
}
