/**
 * The "learn how I write" pass for the Tutor page.
 *
 * Two jobs:
 *   - `transcribeImageSample` turns a photo or scan of the user's work into text, so a
 *     handwritten essay counts as a writing sample like any other.
 *   - `analyzeSamples` reads every sample and returns a StyleProfile — a structured
 *     description of the user's voice, plus the instruction block that gets pasted into
 *     the system prompt of every later turn.
 *
 * The model is asked for strict JSON. Models being models, it sometimes arrives wrapped
 * in a code fence or trailed by a sentence of commentary, so `extractJson` below digs
 * the object out rather than trusting `JSON.parse` on the raw reply.
 */
import { completeOnce } from "./tutorClient";
import { pickModelForTask } from "./tutorRouter";
import type { StyleProfile, WritingSample } from "./tutorStore";
import type { WireMessage } from "../providers";

/** Per-sample cap, so one very long document can't crowd the others out of the prompt. */
const MAX_SAMPLE_CHARS = 6000;
/** Cap across all samples together, to stay inside the smaller context windows. */
const MAX_TOTAL_CHARS = 40000;

const ANALYSIS_INSTRUCTIONS = `You are a writing analyst. Below are samples of one person's own writing.

Study them and describe HOW this person writes — not what they wrote about. Be concrete and specific:
cite actual habits you can see in the samples (average sentence length, how they open and close, whether
they use contractions, em dashes, semicolons, lists, rhetorical questions, sentence fragments, first
person, hedging, jargon, humour). Vague praise is useless; a later model has to reproduce this voice
from your description alone.

Reply with ONE JSON object and nothing else — no code fence, no commentary. Use exactly these keys:

{
  "summary": "one sentence describing the voice",
  "tone": ["3-6 short adjectives"],
  "sentenceRhythm": "sentence length and variation, with approximate numbers",
  "vocabulary": "register, favourite words, level of jargon",
  "structure": "how they open, order, and close a piece",
  "punctuation": "punctuation and formatting habits, including what they never use",
  "quirks": ["3-8 specific reproducible habits"],
  "avoid": ["3-6 things that would immediately read as NOT this person"],
  "instructions": "a paragraph of direct second-person instructions telling a writer how to write as this person"
}`;

/**
 * Pulls the first balanced JSON object out of a model reply. Handles the common
 * wrappers (``` fences, a leading sentence) without needing the model to behave.
 */
function extractJson(raw: string): unknown {
  const text = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "");
  const start = text.indexOf("{");
  if (start === -1) throw new Error("The model didn't return a style profile. Try analyzing again.");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("The model's style profile was cut off. Try analyzing again.");
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => asString(v)).filter(Boolean).slice(0, 10);
  // Some models answer a list field with a comma-separated string — accept that too.
  const s = asString(value);
  return s ? s.split(/[,;]\s*/).filter(Boolean).slice(0, 10) : [];
}

/** Trims the corpus to fit a prompt, oldest samples first so recent work is never dropped. */
function buildCorpus(samples: WritingSample[]): string {
  const usable = samples.filter((s) => s.text.trim());
  const blocks: string[] = [];
  let total = 0;
  for (let i = usable.length - 1; i >= 0; i--) {
    const s = usable[i];
    const body = s.text.trim().slice(0, MAX_SAMPLE_CHARS);
    if (total + body.length > MAX_TOTAL_CHARS) break;
    total += body.length;
    blocks.unshift(`--- SAMPLE: ${s.title} ---\n${body}`);
  }
  return blocks.join("\n\n");
}

/**
 * Reads the user's samples and returns a fresh style profile. Throws with a
 * human-readable message on a gate, a network failure, or an unparseable reply.
 */
export async function analyzeSamples(samples: WritingSample[], signal: AbortSignal): Promise<StyleProfile> {
  const usable = samples.filter((s) => s.text.trim());
  if (usable.length === 0) throw new Error("Add at least one writing sample first.");

  const model = pickModelForTask("analysis");
  const corpus = buildCorpus(usable);
  const messages: WireMessage[] = [{ role: "user", content: `${ANALYSIS_INSTRUCTIONS}\n\n${corpus}` }];

  const raw = await completeOnce({ model, messages, effort: "high", signal });
  const parsed = extractJson(raw) as Record<string, unknown>;

  const wordCount = usable.reduce((n, s) => n + s.text.trim().split(/\s+/).length, 0);
  return {
    summary: asString(parsed.summary, "No summary returned."),
    tone: asStringArray(parsed.tone),
    sentenceRhythm: asString(parsed.sentenceRhythm),
    vocabulary: asString(parsed.vocabulary),
    structure: asString(parsed.structure),
    punctuation: asString(parsed.punctuation),
    quirks: asStringArray(parsed.quirks),
    avoid: asStringArray(parsed.avoid),
    instructions: asString(parsed.instructions),
    sampleIds: usable.map((s) => s.id),
    wordCount,
    modelDisplayName: model.displayName,
    createdAt: Date.now(),
  };
}

/**
 * Transcribes a photo or scan of the user's work so it can serve as a writing sample.
 * Asks for the text only — any commentary the model adds would end up analysed as if
 * the user had written it.
 */
export async function transcribeImageSample(dataUrl: string, name: string, signal: AbortSignal): Promise<string> {
  const model = pickModelForTask("vision");
  const messages: WireMessage[] = [
    {
      role: "user",
      content:
        "Transcribe every word of writing in this image, exactly as written — keep the original wording, " +
        "spelling, punctuation, and paragraph breaks, including any mistakes. Do not correct, summarise, or " +
        "comment on it. Reply with the transcription and nothing else. If there is no writing in the image, " +
        "reply with exactly: NO_TEXT",
      attachments: [{ name, type: /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? "image/jpeg", dataUrl }],
    },
  ];
  const text = (await completeOnce({ model, messages, effort: "medium", signal })).trim();
  if (!text || text === "NO_TEXT") throw new Error("No readable writing was found in that image.");
  return text;
}
