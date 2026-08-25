import type { AdapterParams, Effort, WireMessage } from "../types";
import { ndjsonLine, buildSystemPrompt, sanitizeDelta, MAX_OUTPUT_TOKENS } from "./base";

interface GeminiPart {
  text?: string;
  thought?: boolean;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiStreamChunk {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

/** Token budget for Gemini's thinkingConfig, scaled by effort level. */
const GEMINI_THINKING_BUDGET: Record<Effort, number> = {
  low: 1024,
  medium: 4096,
  high: 8192,
  extra: 16384,
  ultra: 24576,
};

const TEXT_DECODABLE_TYPES = [
  "text/",
  "application/json",
  "application/javascript",
  "application/typescript",
  "application/xml",
  "application/x-yaml",
  "application/x-sh",
];

function isTextDecodable(type: string): boolean {
  return TEXT_DECODABLE_TYPES.some((t) => type.startsWith(t));
}

function decodeDataUrlText(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:[^;]*;base64,(.+)$/s);
  if (!match) return null;
  try {
    const binary = atob(match[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  }
}

function parseDataUrl(dataUrl: string, fallbackMime = "image/jpeg"): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: fallbackMime, data: dataUrl };
}

function buildGeminiContents(messages: WireMessage[], visionCapable: boolean) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const parts: GeminiPart[] = [];
      let text = m.content || "";

      if (m.attachments && m.attachments.length > 0) {
        for (const att of m.attachments) {
          if (!att.dataUrl) continue;
          const type = att.type || "";
          const name = att.name || "attachment";

          if (visionCapable && type.startsWith("image/")) {
            const { mimeType, data } = parseDataUrl(att.dataUrl, type || "image/jpeg");
            parts.push({ inlineData: { mimeType, data } });
            continue;
          }

          if (isTextDecodable(type)) {
            const decoded = decodeDataUrlText(att.dataUrl);
            if (decoded !== null) {
              text += `\n\n[Attached file: ${name}]\n\`\`\`\n${decoded}\n\`\`\``;
              continue;
            }
          }

          const reason = type.startsWith("image/") ? "this model can't see images" : "not readable by this model";
          text += `\n\n[Attached file "${name}" (${type || "unknown type"}) — ${reason}]`;
        }
      }

      parts.push({ text });

      return {
        role: m.role === "assistant" ? "model" : "user",
        parts,
      };
    });
}

function geminiSSEStream(upstream: Response): ReadableStream<Uint8Array> {
  const sanitizerState = { cleared: false };

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let emittedAny = false;
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
              const parts = json.candidates?.[0]?.content?.parts ?? [];

              const reasoning = parts
                .filter((p) => p.thought)
                .map((p) => p.text ?? "")
                .join("");
              if (reasoning) {
                controller.enqueue(ndjsonLine({ reasoning }));
              }

              let text = parts
                .filter((p) => !p.thought)
                .map((p) => p.text ?? "")
                .join("");
              if (text) {
                text = sanitizeDelta(text, sanitizerState);
                if (text) {
                  emittedAny = true;
                  controller.enqueue(ndjsonLine({ delta: text }));
                }
              }
            } catch {
              // ignore malformed SSE frames
            }
          }
        }
        if (!emittedAny) {
          controller.enqueue(ndjsonLine({ error: "Model returned an empty response. Try again or pick a different model." }));
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
 *
 * We inject Scribble's own system prompt (SYSTEM_PROMPT + ambient client context) as the
 * systemInstruction so the model is guided by explicit, controlled instructions.
 */
export async function geminiStreamChat({ apiKey, model, messages, visionCapable, effort, clientContext }: AdapterParams): Promise<ReadableStream<Uint8Array>> {
  const contents = buildGeminiContents(messages, visionCapable);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt(undefined, clientContext) }] },
      contents,
      generationConfig: {
        // thinkingBudget is drawn from the same maxOutputTokens pool, not on top of it —
        // add them so a high thinking budget can't itself eat into (and truncate) the answer.
        maxOutputTokens: MAX_OUTPUT_TOKENS + (effort ? GEMINI_THINKING_BUDGET[effort] : 0),
        ...(effort ? { thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET[effort], includeThoughts: true } } : {}),
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  }
  return geminiSSEStream(res);
}
