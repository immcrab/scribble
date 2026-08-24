import type { AdapterParams, Effort } from "../types";
import { openAICompatibleStream, formatOpenAIMessages, MAX_OUTPUT_TOKENS } from "./base";

/** Groq's gpt-oss models take a native low/medium/high reasoning_effort — no "extra"/"ultra"
 * on their side, so those two clamp to "high" rather than silently doing nothing. */
const GROQ_REASONING_EFFORT: Record<Effort, "low" | "medium" | "high"> = {
  low: "low",
  medium: "medium",
  high: "high",
  extra: "high",
  ultra: "high",
};

/** Groq is OpenAI-compatible — https://api.groq.com/openai/v1/chat/completions */
export async function groqStreamChat({ apiKey, model, messages, visionCapable, effort }: AdapterParams): Promise<ReadableStream<Uint8Array>> {
  // gpt-oss models get the real reasoning_effort param; everything else falls back
  // to the same system-prompt nudge used by providers with no native knob at all.
  const supportsNativeEffort = model.includes("gpt-oss");
  const formattedMessages = formatOpenAIMessages(messages, visionCapable, supportsNativeEffort ? undefined : effort);
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      stream: true,
      max_tokens: MAX_OUTPUT_TOKENS,
      ...(effort && supportsNativeEffort ? { reasoning_effort: GROQ_REASONING_EFFORT[effort] } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  }
  return openAICompatibleStream(res);
}
