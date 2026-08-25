import type { ClientContext, Effort, WireAttachment, WireMessage } from "../types";

const encoder = new TextEncoder();

/** Depth nudge appended to the system prompt for providers with no native
 * reasoning-effort/thinking-budget knob (xKiro, Mistral, custom endpoints) —
 * see gemini.ts for the native version used on that provider. */
const EFFORT_NUDGE: Record<Effort, string> = {
  low: " Keep your reasoning brief — answer directly and concisely, without extended deliberation.",
  medium: " Think through the problem at a normal, practical depth before answering.",
  high: " Reason carefully and thoroughly before answering — check your work before responding.",
  extra: " Reason extensively, consider multiple angles, and double-check your work before answering.",
  ultra:
    " Reason as exhaustively and rigorously as possible — consider edge cases, verify every step, and only answer once you are confident it's correct.",
};

/**
 * The system prompt Scribble sends with every request. We inject it explicitly
 * (rather than relying on the provider's own default) so the model's behavior
 * is controlled and predictable, and so any leaked/echoed copy is easy to strip
 * from the streamed output (see `sanitizeDelta`).
 *
 * The instructions are intentionally minimal — no mention of this being a web
 * app, IDE, or product, so they're safe to surface if a model ever echoes them.
 */
export const SYSTEM_PROMPT =
  'You are Scribble, a friendly and helpful AI assistant. You can discuss any topic, help with coding, answer questions, brainstorm, and help the user learn. If you don\'t know something, say so. If a request is unsafe, refuse. Be concise unless the user wants detail. Format your replies with Markdown. Only give your model name if asked who you are. ' +
  'Some of your messages are automatically preceded by live web search results when a question would benefit from one — you don\'t request these yourself, they just appear inline in the message when present. When they\'re there, use them and answer directly instead of treating the question as unanswerable. When they\'re not there, never claim you have no way to look things up or browse the web — just answer from what you know, giving your best estimate for things like statistics or counts rather than refusing for lack of a precise source. ' +
  'When writing code, always finish what you start — never cut a file or function off mid-statement; a long response is fine, an incomplete one is not. ' +
  'When asked to modify, fix, or add to existing code, change only what is necessary and leave the rest exactly as it was — then output the complete updated file, not just the changed lines. ' +
  'When a task needs more than one file, put each file in its own fenced code block, and give every file a real, specific name (never "file", "file1", "code", or similar) — write it in bold on its own line immediately above that fence, like "**index.html**" or "**src/utils.py**", using the exact filename that project would actually have.';

/**
 * Appends ambient client info (local date/time, timezone, opt-in approximate location) and the
 * effort nudge to SYSTEM_PROMPT. Kept separate from SYSTEM_PROMPT itself since the leak-detection
 * patterns in sanitizeDelta are written against the fixed instructional text — a per-request
 * suffix here never needs to be recognized as a "leak".
 */
export function buildSystemPrompt(effort?: Effort, clientContext?: ClientContext): string {
  let prompt = SYSTEM_PROMPT;
  if (clientContext?.localTime) {
    prompt +=
      ` The user's current local date and time is ${clientContext.localTime}` +
      (clientContext.timezone ? ` (timezone: ${clientContext.timezone})` : "") +
      `. Use this for anything time-relative — don't say you don't know the date.`;
  }
  if (clientContext?.location) {
    prompt +=
      ` The user's approximate location is ${clientContext.location}. Use it only to make answers ` +
      `more relevant (local time, nearby places, units, etc.) — don't mention it unless it's relevant.`;
  }
  if (clientContext?.memories && clientContext.memories.length > 0) {
    const facts = clientContext.memories.slice(0, 50).join(" | ");
    prompt +=
      ` Things you remember about this user from past conversations: ${facts}. Use them naturally ` +
      `when relevant — don't mention that you're recalling stored memory unless asked.`;
  }
  if (clientContext?.customSystemPrompt) {
    prompt += ` Additional instructions from the user: ${clientContext.customSystemPrompt.slice(0, 2000)}`;
  }
  if (effort) prompt += EFFORT_NUDGE[effort];
  return prompt;
}

/** Generous enough for a full multi-file response without truncating, small enough to stay well
 * inside every supported model's max output — providers default to much lower caps (often ~1-2k)
 * when max_tokens is left unset, which is what was cutting long code responses off mid-file. */
export const MAX_OUTPUT_TOKENS = 8192;

/**
 * Some providers (notably xKiro's default config) come with their own
 * system-instruction text ("The user said ... Need to respond in a friendly,
 * helpful manner ... Must not mention platform, IDE, product, service ...
 * Just reply."). When a model echoes that preamble into the streamed reply it
 * shows up as garbled meta-text before the real answer.
 *
 * We strip any leading chunk that looks like a leaked system instruction. The
 * set of markers below covers the known preamble shapes without touching the
 * user's actual content — we only trim leading text that matches a known
 * system-prompt phrase, never the full response.
 */
const LEAK_PATTERNS: RegExp[] = [
  /^The user said\s+/i,
  /^Need to respond in a/i,
  /^Must not mention platform/i,
  /^Must respond in same language/i,
  /^Must only give model name/i,
  /^Just reply\./i,
  /^Just replying\b/i,
  /^As an AI language model\b/i,
  /^As an AI assistant\b/i,
  /^I am an AI\b/i,
  /^I'm an AI\b/i,
];

/** Fixed literal lead-in for each pattern above, used to detect a leak still
 * arriving piecemeal (a two-token delta like "The" can't match the full
 * anchored regex yet, but it IS a prefix of "The user said "). */
const LEAK_PREFIXES = [
  "The user said ",
  "Need to respond in a",
  "Must not mention platform",
  "Must respond in same language",
  "Must only give model name",
  "Just reply.",
  "Just replying",
  "As an AI language model",
  "As an AI assistant",
  "I am an AI",
  "I'm an AI",
];

// Longest known leak preamble runs a few hundred chars; give it real headroom
// before we give up waiting and just flush the buffer as normal content.
const LEAK_BUFFER_LIMIT = 400;

/**
 * Strip a leaked system-prompt preamble from the start of a streamed reply.
 * Providers stream a few characters at a time, so a single delta essentially
 * never contains a whole preamble — we buffer leading text until it's either
 * confirmed as a leak (and stripped) or long/distinct enough to be real
 * content, then pass everything through untouched from then on.
 */
export function sanitizeDelta(delta: string, state: { cleared: boolean; buffer?: string }): string {
  if (state.cleared) return delta;
  const buffer = (state.buffer ?? "") + delta;

  // Repeatedly strip any matching leading patterns (handles them arriving
  // back-to-back, regardless of order).
  let remaining = buffer;
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of LEAK_PATTERNS) {
      const m = remaining.match(pattern);
      if (m) {
        remaining = remaining.slice(m[0].length);
        changed = true;
      }
    }
  }
  if (remaining !== buffer) {
    state.cleared = true;
    state.buffer = undefined;
    return remaining;
  }

  // Nothing stripped yet. If the buffer is still a plausible prefix of a
  // known leak (in either direction — it may be shorter or have already
  // grown past the literal lead-in), keep holding it back.
  const lower = buffer.toLowerCase();
  const couldBeLeak = LEAK_PREFIXES.some((p) => {
    const pl = p.toLowerCase();
    return pl.startsWith(lower) || lower.startsWith(pl);
  });
  if (couldBeLeak && buffer.length < LEAK_BUFFER_LIMIT) {
    state.buffer = buffer;
    return "";
  }

  // Not a leak (or we've buffered long enough to stop waiting) — flush as
  // real content.
  state.cleared = true;
  state.buffer = undefined;
  return buffer;
}

export function ndjsonLine(obj: Record<string, unknown>): Uint8Array {
  return encoder.encode(JSON.stringify(obj) + "\n");
}

/** Mime prefixes/types we can safely decode and inline as plain text for a text-only model. */
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
    // atob is available in the Workers runtime.
    const binary = atob(match[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Renders one attachment down to either an image content part (vision models
 * only) or inlined text appended to the message body — never both silently
 * dropped. This is what makes non-image files (and images sent to
 * non-vision models) actually legible to the model instead of vanishing.
 */
function describeAttachment(att: WireAttachment, visionCapable: boolean): { imagePart?: { type: "image_url"; image_url: { url: string } }; textAppend?: string } {
  const type = att.type || "";
  const name = att.name || "attachment";

  if (visionCapable && type.startsWith("image/") && att.dataUrl) {
    return { imagePart: { type: "image_url", image_url: { url: att.dataUrl } } };
  }

  if (isTextDecodable(type) && att.dataUrl) {
    const text = decodeDataUrlText(att.dataUrl);
    if (text !== null) {
      return { textAppend: `\n\n[Attached file: ${name}]\n\`\`\`\n${text}\n\`\`\`` };
    }
  }

  const reason = type.startsWith("image/") ? "this model can't see images" : "not readable by this model";
  return { textAppend: `\n\n[Attached file "${name}" (${type || "unknown type"}) — ${reason}]` };
}

/**
 * Shaped Scribble's WireMessage format into OpenAI-compatible chat messages,
 * supporting multimodal image attachments via the standard image_url content part.
 *
 * A single Scribble system message is prepended so the model always gets
 * explicit, controlled instructions regardless of the provider's defaults.
 */
export function formatOpenAIMessages(
  messages: WireMessage[],
  visionCapable: boolean,
  effort?: Effort,
  clientContext?: ClientContext
): Array<{
  role: "user" | "assistant" | "system";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
}> {
  const result: Array<{
    role: "user" | "assistant" | "system";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
  }> = [{ role: "system", content: buildSystemPrompt(effort, clientContext) }];

  for (const m of messages) {
    if (m.role === "system") continue; // skip any existing system messages — ours takes precedence

    if (!m.attachments || m.attachments.length === 0) {
      result.push({ role: m.role, content: m.content || "" });
      continue;
    }

    let text = m.content || "";
    const imageParts: Array<{ type: "image_url"; image_url: { url: string } }> = [];

    for (const att of m.attachments) {
      const { imagePart, textAppend } = describeAttachment(att, visionCapable);
      if (imagePart) imageParts.push(imagePart);
      if (textAppend) text += textAppend;
    }

    if (imageParts.length === 0) {
      result.push({ role: m.role, content: text });
    } else {
      result.push({ role: m.role, content: [{ type: "text" as const, text }, ...imageParts] });
    }
  }

  return result;
}

/**
 * Some OpenAI-compatible providers put real answer text somewhere other than
 * a plain string at `delta.content` — an array of content parts. Reasoning
 * models (DeepSeek and friends) additionally stream their chain-of-thought
 * separately on `reasoning_content`/`reasoning` — that must NEVER be treated
 * as answer text: it's freely-generated prose that varies every call, so it
 * can't be filtered by pattern-matching, and showing it to the user reads as
 * a garbled leak (raw "The user says X, I should respond by..." musing
 * glued directly onto the real reply with no separator).
 */
function extractDeltaContent(delta: unknown): string {
  if (!delta || typeof delta !== "object") return "";
  const d = delta as Record<string, unknown>;
  if (typeof d.content === "string") return d.content;
  if (Array.isArray(d.content)) {
    return d.content
      .map((part) => (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string" ? (part as Record<string, unknown>).text as string : ""))
      .join("");
  }
  return "";
}

function extractDeltaReasoning(delta: unknown): string {
  if (!delta || typeof delta !== "object") return "";
  const d = delta as Record<string, unknown>;
  if (typeof d.reasoning_content === "string") return d.reasoning_content;
  if (typeof d.reasoning === "string") return d.reasoning;
  return "";
}

/**
 * Converts an upstream OpenAI-compatible SSE chat-completions stream
 * (`data: {...}\n\n` frames, `[DONE]` sentinel) into Scribble's normalized
 * NDJSON wire protocol: one `{"delta": "..."}` line per token, then
 * `{"done": true}`. Shared by xKiro and Mistral — both speak
 * the same OpenAI-style streaming format.
 *
 * A one-time `sanitizeDelta` pass strips any leaked system-prompt preamble
 * that a model echoes at the start of its first real token.
 */
export function openAICompatibleStream(upstream: Response): ReadableStream<Uint8Array> {
  const sanitizerState = { cleared: false };

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let emittedAny = false;
      let sentError = false;
      let reasoningBuffer = "";
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
            if (data === "[DONE]" || !data) continue;

            try {
              const json = JSON.parse(data) as {
                choices?: { delta?: unknown; message?: { content?: string } }[];
                error?: string | { message?: string };
              };

              // Some OpenAI-compatible gateways report a failure as a
              // `data: {"error": ...}` frame inside an otherwise-200 SSE
              // stream instead of a non-2xx HTTP response — surface the
              // real reason instead of letting it fall through as a
              // generic "empty response".
              if (json.error && !sentError) {
                const message = typeof json.error === "string" ? json.error : json.error.message || "Upstream model error.";
                sentError = true;
                controller.enqueue(ndjsonLine({ error: message }));
                continue;
              }

              const upstreamDelta = json.choices?.[0]?.delta;
              const reasoningDelta = extractDeltaReasoning(upstreamDelta);
              if (reasoningDelta) {
                reasoningBuffer += reasoningDelta;
                controller.enqueue(ndjsonLine({ reasoning: reasoningDelta }));
              }

              let delta = extractDeltaContent(upstreamDelta) || json.choices?.[0]?.message?.content || "";
              if (delta) {
                delta = sanitizeDelta(delta, sanitizerState);
                if (delta) {
                  emittedAny = true;
                  controller.enqueue(ndjsonLine({ delta }));
                }
              }
            } catch {
              // ignore malformed SSE frames
            }
          }
        }
        // The model never sent real content (only reasoning, or nothing at
        // all) — fall back to the reasoning text rather than an empty
        // bubble, since some content beats none for a cut-off response.
        if (!emittedAny && reasoningBuffer && !sentError) {
          const fallback = sanitizeDelta(reasoningBuffer, sanitizerState);
          if (fallback) {
            emittedAny = true;
            controller.enqueue(ndjsonLine({ delta: fallback }));
          }
        }
        if (!emittedAny && !sentError) {
          sentError = true;
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
