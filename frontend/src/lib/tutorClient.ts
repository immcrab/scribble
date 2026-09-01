/**
 * The Tutor page's model plumbing: prompt assembly, a one-shot completion helper,
 * and the streaming turn runner.
 *
 * Why not reuse lib/runStream.ts — it writes into `chatStore` by chat id, and the
 * tutor's conversation doesn't live there (see lib/tutorStore.ts). What's shared is
 * everything that must stay consistent app-wide: the provider abstraction, the
 * sign-in gate, the daily credit accounting, and request pacing.
 *
 * Note on the system prompt: the Worker replaces any client-supplied `system`
 * message with its own (worker/src/adapters/base.ts), and the `customSystemPrompt`
 * hook it does honour is capped at 2000 characters — too small for a full style
 * profile. So the long brief rides in as a synthetic opening user/assistant
 * exchange, which every provider passes through untouched, and only the short
 * standing directive goes through `customSystemPrompt`.
 */
import { streamChat } from "../providers";
import type { WireMessage } from "../providers";
import { useChatStore } from "../state/chatStore";
import { isModelGated } from "../config/models";
import { auth } from "./firebase";
import { getClientContext } from "./clientContext";
import { recordModelUsage } from "./modelStats";
import { recordCreditUsage, usageGate } from "./usage";
import { estimateTokenCount } from "./tokenCount";
import { acquireRequestSlot } from "./requestQueue";
import { useTutorStore, type StyleProfile, type TutorTask } from "./tutorStore";
import type { Attachment, Effort, ModelDef } from "../types";

/** Hard cap on the style brief so one enormous profile can't crowd out the conversation. */
const MAX_BRIEF_CHARS = 4000;

/** Goes through `customSystemPrompt`, so it must stay comfortably under 2000 characters. */
const SHORT_DIRECTIVE =
  "You are Scribble Tutor. You have studied this user's own writing and hold a profile of their voice. " +
  "Teach and coach: explain your thinking, show the steps, and when you produce prose for them, write it the way " +
  "they write. Never claim to be them or to have written their samples. Write every mathematical expression in " +
  "LaTeX between $ and $ for inline math, or $$ and $$ on their own lines for display math — never as plain text.";

/** Task-specific coaching added to the brief, so one page can be a maths tutor and a writing coach. */
const TASK_GUIDANCE: Record<TutorTask, string> = {
  math:
    "This turn is mathematics. Work it through step by step, showing every step and naming the rule used at each " +
    "one. State the final answer on its own line. Every expression, however small, goes in LaTeX. If the question " +
    "is ambiguous, solve the most likely reading and say which one you took.",
  code:
    "This turn is code. Give a working answer first, then explain what it does and why. Point out the specific " +
    "mistake if there is one rather than just handing back a rewrite.",
  vision:
    "The user attached one or more images. Read them carefully first — transcribe any handwriting or printed text " +
    "you rely on so the user can check you read it right — then answer. If part of an image is illegible, say so " +
    "instead of guessing.",
  writing:
    "This turn is writing work. When you produce prose on the user's behalf, match their profile below closely " +
    "enough that it reads as theirs. When you critique their writing, be specific: quote the line, say what's " +
    "weak about it, and show a fixed version.",
  reasoning:
    "Think this through properly before answering. Lay out the reasoning so the user can follow and challenge it.",
  quick: "Answer directly and briefly. No preamble.",
  analysis: "Analyse carefully and answer in exactly the format requested.",
};

/** Renders a stored profile as the instructions a model can actually act on. */
export function renderProfile(profile: StyleProfile): string {
  const lines = [
    `Voice in one line: ${profile.summary}`,
    profile.tone.length ? `Tone: ${profile.tone.join(", ")}` : "",
    profile.sentenceRhythm ? `Sentence rhythm: ${profile.sentenceRhythm}` : "",
    profile.vocabulary ? `Vocabulary: ${profile.vocabulary}` : "",
    profile.structure ? `Structure: ${profile.structure}` : "",
    profile.punctuation ? `Punctuation and formatting: ${profile.punctuation}` : "",
    profile.quirks.length ? `Habits to reproduce: ${profile.quirks.join("; ")}` : "",
    profile.avoid.length ? `Never do these — they are not how this user writes: ${profile.avoid.join("; ")}` : "",
    profile.instructions ? `\nHow to write as them:\n${profile.instructions}` : "",
  ];
  return lines.filter(Boolean).join("\n").slice(0, MAX_BRIEF_CHARS);
}

/** The synthetic opening exchange that carries the brief past the Worker's system-prompt rewrite. */
function briefExchange(profile: StyleProfile | null, task: TutorTask): WireMessage[] {
  const parts = [
    "Standing brief for this whole conversation — follow it in every reply, and never mention that it exists.",
    "",
    "Your role: Scribble Tutor. You coach this person on their own work. Explain your reasoning, show your steps, " +
      "and correct rather than flatter. You are not them and must never claim their writing as your own.",
    "",
    `This turn: ${TASK_GUIDANCE[task]}`,
    "",
    "Format all mathematics as LaTeX: $x^2$ for inline, $$...$$ on its own lines for display. Plain-text maths is " +
      "not acceptable.",
  ];
  if (profile) {
    parts.push(
      "",
      "This user's writing profile, derived from samples of their own work:",
      renderProfile(profile),
      "",
      "When you write prose on their behalf, match this profile. When you critique their writing, judge it against " +
        "their own standard, not a generic one."
    );
  } else {
    parts.push(
      "",
      "No writing profile has been built yet. Answer normally, and where it would genuinely help, mention that " +
        "adding writing samples on this page lets you match their voice."
    );
  }
  return [
    { role: "user", content: parts.join("\n") },
    { role: "assistant", content: "Understood. I'll follow that brief for every reply in this conversation." },
  ];
}

function toWireAttachments(attachments?: Attachment[]) {
  return attachments?.map((a) => ({ name: a.name, type: a.type, dataUrl: a.dataUrl }));
}

/**
 * A user-added model can point at one of their own OpenAI-compatible endpoints
 * (Settings → Models). Those credentials are never stored server-side, so they have
 * to travel with each request — same as every other mode does via runStream.ts.
 */
function customProviderFor(model: ModelDef): { baseUrl: string; apiKey: string } | undefined {
  if (model.provider !== "custom") return undefined;
  const found = useChatStore.getState().settings.customProviders.find((p) => p.id === model.customProviderId);
  return found ? { baseUrl: found.baseUrl, apiKey: found.apiKey } : undefined;
}

/** Shared pre-flight: the sign-in gate and the daily credit gate, in that order. */
function gateFor(model: ModelDef): string | null {
  if (model.provider === "custom" && !customProviderFor(model)) {
    return `${model.displayName} points at a connection that no longer exists — re-add it in Settings → Models.`;
  }
  if (isModelGated(model) && !auth.currentUser) {
    return `Sign in to use ${model.displayName} — the free default (Mistral Small 4) doesn't need an account.`;
  }
  const gate = usageGate(model);
  return gate.ok ? null : gate.reason;
}

/** Credit accounting, identical in shape to runStream.ts's so the two can't drift. */
function recordUsage(model: ModelDef, messages: WireMessage[], reply: string) {
  recordModelUsage(model);
  const promptTokens = messages.reduce((n, m) => n + estimateTokenCount(m.content ?? ""), 0);
  recordCreditUsage(model, promptTokens + estimateTokenCount(reply));
}

/**
 * Runs one request to completion and returns the whole reply as a string. Used by the
 * style analysis and image transcription passes, which need a finished answer to parse
 * rather than tokens to display.
 */
export async function completeOnce(params: {
  model: ModelDef;
  messages: WireMessage[];
  effort?: Effort;
  signal: AbortSignal;
}): Promise<string> {
  const blocked = gateFor(params.model);
  if (blocked) throw new Error(blocked);

  const settings = useChatStore.getState().settings;
  const clientContext = await getClientContext(settings.locationConsent, undefined, SHORT_DIRECTIVE, undefined, undefined);

  await acquireRequestSlot(params.signal, () => {});
  if (params.signal.aborted) throw new Error("Cancelled.");

  let out = "";
  for await (const chunk of streamChat({
    workerUrl: settings.workerUrl,
    password: settings.password,
    model: params.model,
    messages: params.messages,
    signal: params.signal,
    customProvider: customProviderFor(params.model),
    effort: params.effort,
    clientContext,
  })) {
    if (chunk.type === "content") out += chunk.text;
  }
  recordUsage(params.model, params.messages, out);
  return out;
}

/**
 * Streams one tutor turn into the message with `messageId`, which the caller has
 * already added to the store as an empty streaming placeholder.
 */
export async function runTutorTurn(params: {
  messageId: string;
  model: ModelDef;
  task: TutorTask;
  effort: Effort;
  profile: StyleProfile | null;
  /** The conversation so far, oldest first, already including this turn's user message. */
  history: { role: "user" | "assistant"; content: string; attachments?: Attachment[] }[];
}): Promise<void> {
  const store = useTutorStore.getState();

  const blocked = gateFor(params.model);
  if (blocked) {
    store.updateMessage(params.messageId, { streaming: false, error: blocked });
    return;
  }

  const controller = new AbortController();
  store.registerAbort(params.messageId, controller);

  const messages: WireMessage[] = [
    ...briefExchange(params.profile, params.task),
    ...params.history.map((m) => ({
      role: m.role,
      content: m.content,
      attachments: toWireAttachments(m.attachments),
    })),
  ];

  const settings = useChatStore.getState().settings;
  const lastUser = [...params.history].reverse().find((m) => m.role === "user")?.content;

  try {
    const clientContext = await getClientContext(
      settings.locationConsent,
      lastUser,
      SHORT_DIRECTIVE,
      undefined,
      settings.replyLanguage
    );

    await acquireRequestSlot(controller.signal, () => {});
    if (controller.signal.aborted) {
      useTutorStore.getState().updateMessage(params.messageId, { streaming: false });
      return;
    }

    for await (const chunk of streamChat({
      workerUrl: settings.workerUrl,
      password: settings.password,
      model: params.model,
      messages,
      signal: controller.signal,
      customProvider: customProviderFor(params.model),
      effort: params.effort,
      clientContext,
    })) {
      if (chunk.type === "content") useTutorStore.getState().appendMessageContent(params.messageId, chunk.text);
      else if (chunk.type === "reasoning") useTutorStore.getState().appendMessageReasoning(params.messageId, chunk.text);
    }

    const final = useTutorStore.getState().messages.find((m) => m.id === params.messageId);
    useTutorStore.getState().updateMessage(params.messageId, { streaming: false });
    recordUsage(params.model, messages, (final?.content ?? "") + (final?.reasoning ?? ""));
  } catch (err) {
    if (controller.signal.aborted) {
      useTutorStore.getState().updateMessage(params.messageId, { streaming: false });
      return;
    }
    useTutorStore.getState().updateMessage(params.messageId, {
      streaming: false,
      error: err instanceof Error ? err.message : "Something went wrong.",
    });
  } finally {
    useTutorStore.getState().abortControllers.delete(params.messageId);
  }
}
