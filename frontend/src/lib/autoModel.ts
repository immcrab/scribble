import { getAllModels, getDefaultModel } from "../config/models";
import type { ModelDef } from "../types";

/** A persisted selector value, never sent to a provider. The request resolver below
 * turns it into a real available model at send time. */
export const AUTO_MODEL_ID = "__scribble_auto__";
export const AUTO_MODEL: ModelDef = {
  provider: "xkiro", modelId: AUTO_MODEL_ID, displayName: "Auto — best for this request",
  icon: "Sparkles", contextLength: 128000, capabilities: ["text", "vision", "code", "reasoning"],
  free: true, supportsStreaming: true, supportsVision: true,
  description: "Scribble picks an available model based on the request.",
};

/** Small transparent router: favors vision for images, reasoning for analysis, code for
 * coding, then a fast reliable default. It intentionally only chooses models currently
 * in the catalog, so an admin can retire a provider without breaking Auto. */
export function chooseModelForRequest(prompt: string, hasImage = false): ModelDef {
  const models = getAllModels().filter((m) => m.supportsStreaming && !m.knownBroken);
  const q = prompt.toLowerCase();
  const wantsCode = /\b(code|typescript|javascript|python|bug|error|debug|function|api|sql|react)\b/.test(q);
  const wantsReasoning = /\b(explain|analyze|reason|compare|plan|math|proof|strategy)\b/.test(q);
  const scored = models.map((model) => {
    let score = model.free ? 2 : 0;
    if (hasImage && model.supportsVision) score += 10;
    if (wantsCode && model.capabilities.includes("code")) score += 8;
    if (wantsReasoning && model.capabilities.includes("reasoning")) score += 6;
    if (model.supportsVision) score += 1;
    return { model, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.model ?? getDefaultModel();
}
