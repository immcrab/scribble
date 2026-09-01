/**
 * Automatic model selection for the Tutor page.
 *
 * The rest of the app makes the user pick a model. The tutor doesn't: one turn may
 * be a photo of handwritten homework, the next a proof, the next "rewrite this
 * paragraph in my voice" — and those want genuinely different models. This module
 * classifies the turn from its text and attachments, then picks the best available
 * model for that class.
 *
 * Two-stage pick, so the router keeps working as the catalog turns over:
 *   1. a hand-ranked preference list of model ids per task (the models we know are
 *      strongest at it today), and
 *   2. a capability score fallback, used when none of the preferred ids are in the
 *      catalog any more — hidden by the admin, or simply renamed.
 * If both come up empty the free default model is used, which always exists.
 */
import { getAllModels, getDefaultModel, isModelGated } from "../config/models";
import { auth } from "./firebase";
import { useChatStore } from "../state/chatStore";
import { usageGate } from "./usage";
import type { Effort, ModelDef } from "../types";
import type { TutorTask } from "./tutorStore";

export interface TutorRoute {
  model: ModelDef;
  task: TutorTask;
  /** One short line explaining the pick, shown under the reply. */
  reason: string;
  effort: Effort;
}

/**
 * Preferred model ids per task, best first. Ids not in the catalog are skipped, so
 * this list can safely name models the admin has hidden or that were never added.
 * Keep entries here in step with config/models.ts when the catalog changes.
 */
const PREFERENCES: Record<TutorTask, string[]> = {
  vision: [
    "qwen/qwen3-vl-plus:free",
    "qwen/qwen3.8-max:free",
    "gemini-3.7-flash",
    "qwen/qwen3.6-plus:free",
    "gemini-3.6-flash",
  ],
  math: [
    "deepseek/deepseek-v4-pro",
    "qwen/qwen3.8-max:free",
    "minimax/minimax-m2.7",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "deepseek/deepseek-v3.2",
  ],
  code: [
    "qwen/qwen3-coder-plus:free",
    "mistralai/codestral-2508",
    "mistralai/devstral-medium",
    "deepseek/deepseek-v4-pro",
    "cohere/north-mini-code:free",
  ],
  reasoning: [
    "qwen/qwen3.8-max:free",
    "deepseek/deepseek-v4-pro",
    "minimax/minimax-m2.7",
    "z-ai/glm-5.2:free",
    "qwen/qwen3.7-max:free",
  ],
  writing: [
    "mistralai/mistral-large-2512",
    "qwen/qwen3.8-max:free",
    "mistralai/mistral-medium-3.5",
    "gemini-3.7-flash",
    "z-ai/glm-5.2:free",
  ],
  quick: [
    "qwen/qwen3.5-flash:free",
    "gemini-3.5-flash",
    "mistralai/mistral-small-2603",
    "mistralai/ministral-14b",
  ],
  // The style-analysis pass reads a lot of text and has to hold a whole voice in
  // its head — same shape as a hard reasoning turn.
  analysis: [
    "qwen/qwen3.8-max:free",
    "mistralai/mistral-large-2512",
    "deepseek/deepseek-v4-pro",
    "minimax/minimax-m2.7",
  ],
};

/** Reasoning depth per task — math and analysis get the budget, quick answers don't. */
const EFFORTS: Record<TutorTask, Effort> = {
  vision: "medium",
  math: "high",
  code: "high",
  reasoning: "high",
  writing: "medium",
  quick: "low",
  analysis: "high",
};

const REASONS: Record<TutorTask, string> = {
  vision: "image attached — picked a model that can see",
  math: "looks like math — picked a strong reasoning model",
  code: "looks like code — picked a coding model",
  reasoning: "a hard question — picked a strong reasoning model",
  writing: "writing work — picked a model with the best prose",
  quick: "a short question — picked a fast model",
  analysis: "reading your samples — picked a strong analysis model",
};

const MATH_WORDS =
  /\b(solve|equation|derivative|integral|integrate|differentiate|factor|simplify|prove|proof|theorem|matrix|matrices|vector|probability|algebra|calculus|geometry|trigonometry|logarithm|polynomial|quadratic|inequality|fraction|percent(?:age)?|arithmetic|sum of|area of|volume of|perimeter|hypotenuse|standard deviation|median|mean of)\b/i;
/** LaTeX delimiters and operators — a much stronger signal than the vocabulary above. */
const MATH_NOTATION = /\\\(|\\\[|\$\$|\\frac|\\int|\\sum|\\sqrt|\\begin\{|[∫∑√π≤≥≠±×÷]|\d\s*[+\-*/^=]\s*\d|\bx\s*[=^]\s*\d/;

const CODE_WORDS =
  /\b(function|const |let |class |import |return|compile|stack ?trace|traceback|null pointer|segfault|typescript|javascript|python|java|rust|golang|sql|regex|api endpoint|refactor|debug|syntax error|npm|pip|git)\b/i;

const WRITING_WORDS =
  /\b(rewrite|rephrase|reword|draft|essay|paragraph|thesis|tone|voice|edit|proofread|feedback|critique|outline|intro(?:duction)?|conclusion|my style|in my voice|cover letter|email|blog|article|story|caption)\b/i;

const REASONING_WORDS =
  /\b(analy[sz]e|compare|contrast|evaluate|argue|explain why|reason(?:ing)?|strategy|plan out|trade-?offs?|implications|critique the|step by step)\b/i;

/**
 * Classifies one turn. Images win outright — nothing else can be answered without
 * seeing them. Otherwise the strongest signal wins, with plain length as the
 * tiebreaker between a quick question and real work.
 */
export function detectTask(text: string, hasImages: boolean): TutorTask {
  if (hasImages) return "vision";
  const t = text ?? "";
  if (MATH_NOTATION.test(t) || MATH_WORDS.test(t)) return "math";
  if (/```/.test(t) || CODE_WORDS.test(t)) return "code";
  if (WRITING_WORDS.test(t)) return "writing";
  if (REASONING_WORDS.test(t) || t.length > 1200) return "reasoning";
  if (t.length < 140) return "quick";
  return "writing";
}

/**
 * Models this browser can actually send to right now — including the ones the user
 * added themselves in Settings → Models, whether they point at a built-in provider or
 * at one of their own OpenAI-compatible endpoints.
 *
 * A custom model is only a candidate while the connection that owns it still exists;
 * deleting a provider in Settings would otherwise leave models behind that fail at the
 * Worker with no key. Puter stays out of *automatic* selection because it opens its own
 * sign-in popup mid-turn — it's still selectable from the page's manual override.
 */
function candidates(): ModelDef[] {
  const signedIn = !!auth.currentUser;
  const providers = useChatStore.getState().settings.customProviders;
  return getAllModels().filter((m) => {
    if (!m.supportsStreaming || m.knownBroken) return false;
    if (m.provider === "puter") return false;
    if (m.provider === "custom" && !providers.some((p) => p.id === m.customProviderId)) return false;
    return (signedIn || !isModelGated(m)) && usageGate(m).ok;
  });
}

/** Capability score for `task`, used only when no preferred id survives. */
function score(model: ModelDef, task: TutorTask): number {
  const has = (c: string) => model.capabilities.includes(c as ModelDef["capabilities"][number]);
  let n = 0;
  if (task === "vision") {
    if (!model.supportsVision) return -1; // can't see the image — disqualified, not just weak
    n += 5;
  }
  if ((task === "math" || task === "reasoning" || task === "analysis") && has("reasoning")) n += 4;
  if (task === "code" && has("code")) n += 4;
  if (task === "writing" && has("text")) n += 1;
  // Context length is the one universally comparable quality signal in the catalog.
  n += Math.min(3, Math.log10(Math.max(1, model.contextLength)) - 4);
  // A fast turn shouldn't reach for the largest model available.
  if (task === "quick") n = -n;
  return n;
}

/** Picks the best available model for `task`, ignoring how the turn was classified. */
export function pickModelForTask(task: TutorTask): ModelDef {
  const pool = candidates();
  if (pool.length === 0) return getDefaultModel();

  for (const id of PREFERENCES[task]) {
    const match = pool.find((m) => m.modelId === id);
    if (match) return match;
  }

  const scored = pool
    .map((m) => ({ m, s: score(m, task) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s);
  return scored[0]?.m ?? getDefaultModel();
}

/**
 * The router proper: classify the turn, then pick for it. Pass `override` to honour a
 * manual model choice — the task (and so the effort and system prompt) is still
 * detected, only the model is fixed.
 */
export function routeTutorTurn(params: { text: string; hasImages: boolean; override?: ModelDef }): TutorRoute {
  const task = detectTask(params.text, params.hasImages);
  if (params.override) {
    // A hand-picked model that can't see an attached image would fail silently at the
    // provider, so say so up front rather than letting the reply hallucinate the image.
    const blind = params.hasImages && !params.override.supportsVision;
    return {
      model: params.override,
      task,
      reason: blind
        ? `you picked ${params.override.displayName}, which can't read images`
        : `you picked ${params.override.displayName}`,
      effort: EFFORTS[task],
    };
  }
  const model = pickModelForTask(task);
  return { model, task, reason: `${REASONS[task]} · ${model.displayName}`, effort: EFFORTS[task] };
}
