import type { AdapterParams } from "../types";
import { openAICompatibleStream } from "./base";

/** Groq is OpenAI-compatible — https://api.groq.com/openai/v1/chat/completions */
export async function groqStreamChat({ apiKey, model, messages }: AdapterParams): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok) {
    throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  }
  return openAICompatibleStream(res);
}
