import type { AdapterParams } from "../types";
import { openAICompatibleStream, formatOpenAIMessages, MAX_OUTPUT_TOKENS } from "./base";

const XKIRO_URL = "https://api.xkiro.com/v1/chat/completions";
const MAX_ATTEMPTS = 3;

function fetchXkiro(apiKey: string, model: string, formattedMessages: unknown): Promise<Response> {
  return fetch(XKIRO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages: formattedMessages, stream: true, max_tokens: MAX_OUTPUT_TOKENS }),
  });
}

/**
 * xKiro intermittently 200s an SSE stream whose very first frame is
 * `data: {"error":"A server error occurred. Please try again."}` — a
 * transient failure on their end (observed on Qwen models, ~50% of calls),
 * not a real model response. Retrying the whole request almost always
 * succeeds, so we peek the first frame before handing the stream back: on
 * that specific error we discard it and retry (up to MAX_ATTEMPTS total),
 * otherwise we splice the peeked bytes back onto the stream so nothing sent
 * before the peek is lost.
 */
async function fetchWithRetry(apiKey: string, model: string, formattedMessages: unknown): Promise<Response> {
  let res!: Response;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    res = await fetchXkiro(apiKey, model, formattedMessages);
    if (!res.ok) return res;

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let peekedText = "";
    let firstValue: Uint8Array | undefined;
    let firstDone = false;

    // Buffer a few reads looking for a complete first SSE line to check.
    for (let i = 0; i < 5; i++) {
      const { value, done } = await reader.read();
      if (value) {
        firstValue = firstValue ? concatBytes(firstValue, value) : value;
        peekedText += decoder.decode(value, { stream: true });
      }
      if (done) {
        firstDone = true;
        break;
      }
      if (peekedText.includes("\n")) break;
    }

    const isTransientError = /data:\s*\{"error"/.test(peekedText);
    if (isTransientError && attempt < MAX_ATTEMPTS) {
      await reader.cancel().catch(() => {});
      continue;
    }

    let firstChunkServed = false;
    const rebuilt = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (!firstChunkServed) {
          firstChunkServed = true;
          if (firstValue) controller.enqueue(firstValue);
          if (firstDone) controller.close();
          return;
        }
        const { value, done } = await reader.read();
        if (value) controller.enqueue(value);
        if (done) controller.close();
      },
    });
    return new Response(rebuilt, { status: res.status, statusText: res.statusText, headers: res.headers });
  }
  return res;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
}

/** xKiro is OpenAI-compatible — https://api.xkiro.com/v1/chat/completions */
export async function xkiroStreamChat({ apiKey, model, messages, visionCapable, effort }: AdapterParams): Promise<ReadableStream<Uint8Array>> {
  const formattedMessages = formatOpenAIMessages(messages, visionCapable, effort);
  const res = await fetchWithRetry(apiKey, model, formattedMessages);

  if (!res.ok) {
    throw new Error(`xKiro error ${res.status}: ${await res.text()}`);
  }
  return openAICompatibleStream(res);
}
