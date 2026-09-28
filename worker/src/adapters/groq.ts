import type { AdapterParams } from "../types";
import { openAICompatibleStream, formatOpenAIMessages, MAX_OUTPUT_TOKENS } from "./base";

/** GroqCloud's chat-completions endpoint is OpenAI-compatible. */
export async function groqStreamChat({ apiKey, model, messages, visionCapable, effort, clientContext }: AdapterParams): Promise<ReadableStream<Uint8Array>> {
  const formattedMessages = formatOpenAIMessages(messages, visionCapable, effort, clientContext);
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: formattedMessages, stream: true, max_tokens: MAX_OUTPUT_TOKENS }),
  });

  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  return openAICompatibleStream(res);
}
