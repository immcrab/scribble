import type { AdapterParams } from "../types";
import { openAICompatibleStream, formatOpenAIMessages } from "./base";

// The smallest Cloudflare model exposed by this app has a 32K window. Keep a
// response reserve instead of blindly requesting the global 32K output cap.
const CONTEXT_WINDOW_TOKENS = 32_000;
const PREFERRED_OUTPUT_TOKENS = 4_096;
const CONTEXT_MARGIN_TOKENS = 256;

function estimateTokens(value: unknown): number {
  // Fast, intentionally conservative estimate. Cloudflare performs the exact
  // accounting upstream; this prevents the avoidable max-output overflow.
  return Math.ceil(JSON.stringify(value).length / 4);
}

/** Retain the system prompt and newest turns when a chat approaches 32K. */
function fitMessages<T>(messages: T[]): T[] {
  if (messages.length <= 1) return messages;

  const budget = CONTEXT_WINDOW_TOKENS - PREFERRED_OUTPUT_TOKENS - CONTEXT_MARGIN_TOKENS;
  const kept: T[] = [messages[0]];
  let used = estimateTokens(messages[0]);

  for (const message of messages.slice(1).reverse()) {
    const cost = estimateTokens(message);
    if (used + cost > budget) continue;
    kept.splice(1, 0, message);
    used += cost;
  }
  return kept;
}

/** Cloudflare Workers AI exposes its hosted chat models through an OpenAI-compatible endpoint. */
export async function cloudflareStreamChat({ apiKey, accountId, model, messages, visionCapable, effort, clientContext }: AdapterParams): Promise<ReadableStream<Uint8Array>> {
  if (!accountId) throw new Error("Cloudflare AI is missing CF_ACCOUNT_ID.");

  const fittedMessages = fitMessages(formatOpenAIMessages(messages, visionCapable, effort, clientContext));
  const availableOutputTokens = CONTEXT_WINDOW_TOKENS - estimateTokens(fittedMessages) - CONTEXT_MARGIN_TOKENS;
  const maxTokens = Math.max(256, Math.min(PREFERRED_OUTPUT_TOKENS, availableOutputTokens));

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: fittedMessages, stream: true, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`Cloudflare Workers AI error ${res.status}: ${await res.text()}`);
  return openAICompatibleStream(res);
}