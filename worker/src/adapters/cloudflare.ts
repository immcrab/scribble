import type { AdapterParams } from "../types";
import { openAICompatibleStream, formatOpenAIMessages, MAX_OUTPUT_TOKENS } from "./base";

/** Cloudflare Workers AI exposes its hosted chat models through an OpenAI-compatible endpoint. */
export async function cloudflareStreamChat({ apiKey, accountId, model, messages, visionCapable, effort, clientContext }: AdapterParams): Promise<ReadableStream<Uint8Array>> {
  if (!accountId) throw new Error("Cloudflare AI is missing CF_ACCOUNT_ID.");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: formatOpenAIMessages(messages, visionCapable, effort, clientContext), stream: true, max_tokens: MAX_OUTPUT_TOKENS }),
  });
  if (!res.ok) throw new Error(`Cloudflare Workers AI error ${res.status}: ${await res.text()}`);
  return openAICompatibleStream(res);
}
