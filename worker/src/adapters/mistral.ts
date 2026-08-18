import type { AdapterParams } from "../types";
import { openAICompatibleStream } from "./base";

/** Mistral La Plateforme is OpenAI-compatible — https://api.mistral.ai/v1/chat/completions */
export async function mistralStreamChat({ apiKey, model, messages }: AdapterParams): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok) {
    throw new Error(`Mistral error ${res.status}: ${await res.text()}`);
  }
  return openAICompatibleStream(res);
}
