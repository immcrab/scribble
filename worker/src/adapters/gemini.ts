import type { AdapterParams } from "../types";
import { ndjsonLine } from "./base";

interface GeminiPart {
  text?: string;
}

interface GeminiStreamChunk {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

function geminiSSEStream(upstream: Response): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (!line.startsWith("data:")) continue;

            const data = line.slice(5).trim();
            if (!data) continue;

            try {
              const json = JSON.parse(data) as GeminiStreamChunk;
              const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
              if (text) controller.enqueue(ndjsonLine({ delta: text }));
            } catch {
              // ignore malformed SSE frames
            }
          }
        }
        controller.enqueue(ndjsonLine({ done: true }));
      } catch (err) {
        controller.enqueue(ndjsonLine({ error: err instanceof Error ? err.message : "Upstream stream error" }));
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * Gemini's free-tier streamGenerateContent endpoint. Distinct wire format
 * from the OpenAI-style providers: roles are "user"/"model" (not
 * "assistant"), and system prompts are a separate `systemInstruction` field.
 */
export async function geminiStreamChat({ apiKey, model, messages }: AdapterParams): Promise<ReadableStream<Uint8Array>> {
  const systemMsg = messages.find((m) => m.role === "system");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  }
  return geminiSSEStream(res);
}
