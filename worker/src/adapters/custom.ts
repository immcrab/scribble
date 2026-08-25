import type { ClientContext, Effort, WireMessage } from "../types";
import { openAICompatibleStream, formatOpenAIMessages, MAX_OUTPUT_TOKENS } from "./base";

/**
 * User-defined OpenAI-compatible endpoint (Settings → Custom Models). Same
 * wire format as xKiro/Mistral, but the base URL and API key come from
 * the request body instead of a Worker secret — this is the user's own key,
 * proxied only to dodge browser CORS, never stored server-side.
 */
export async function customStreamChat({
  apiKey,
  baseUrl,
  model,
  messages,
  visionCapable,
  effort,
  clientContext,
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: WireMessage[];
  visionCapable: boolean;
  effort?: Effort;
  clientContext?: ClientContext;
}): Promise<ReadableStream<Uint8Array>> {
  const formattedMessages = formatOpenAIMessages(messages, visionCapable, effort, clientContext);
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages: formattedMessages, stream: true, max_tokens: MAX_OUTPUT_TOKENS }),
  });

  if (!res.ok) {
    throw new Error(`Custom provider error ${res.status}: ${await res.text()}`);
  }
  return openAICompatibleStream(res);
}
