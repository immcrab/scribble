import type { ModelDef, Provider } from "../types";

// Adding a model here? Also add a one-line entry to modelDocs.ts — see ADD_NEW_MODEL.md.

/**
 * xKiro model catalog — EDIT THIS BLOCK ONLY to add/remove xKiro models.
 * Nothing else in the app needs to change: xKiro is OpenAI-compatible, so any
 * modelId listed here is sent as-is to https://api.xkiro.com/v1/chat/completions
 * by the Worker's xkiro adapter.
 *
 * This list was verified live against a real xKiro free-plan key (Aug 2026):
 * xKiro's full catalog is 80+ models, but most (Claude, GPT-5.x, Kimi, GLM,
 * Grok, Nemotron, Gemini-via-xKiro, DeepSeek) return 403 "requires a paid
 * account" on the free plan. The models below all returned real streamed
 * completions on a free-plan key. Re-check with:
 *   curl https://api.xkiro.com/v1/models -H "Authorization: Bearer $KEY"
 * (that endpoint lists the full catalog, not just what's free — you still
 * have to test individual models to know which are actually unlocked).
 *
 * QWEN FLAKINESS (2026-08-20): xKiro's Qwen route intermittently (~50% of
 * calls, observed) 200s an SSE stream whose first frame is `data:
 * {"error":"A server error occurred. Please try again."}` instead of real
 * content — a transient failure on xKiro's end, not our adapter. The Worker's
 * xkiro adapter (worker/src/adapters/xkiro.ts) now retries that specific
 * error up to 3 times before surfacing it, which brought the observed
 * end-to-end failure rate down to ~5% — in line with any other model's
 * occasional hiccup, so these three don't carry a `knownBroken` flag. Only
 * the three Qwen ids actually wanted are listed below; the other six xKiro
 * Qwen ids stay out until asked for.
 */
const XKIRO_MODELS: ModelDef[] = [
  {
    provider: "xkiro",
    modelId: "qwen/qwen3.8-max",
    displayName: "Qwen3.8 Max",
    icon: "Sparkles",
    contextLength: 1000000,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3.5-flash",
    displayName: "Qwen3.5 Flash",
    icon: "Sparkles",
    contextLength: 1000000,
    capabilities: ["text", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3-coder-plus",
    displayName: "Qwen3 Coder Plus",
    icon: "Sparkles",
    contextLength: 128000,
    capabilities: ["text", "code", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "mistralai/mistral-small-2603",
    displayName: "Mistral Small 4",
    icon: "Sparkles",
    contextLength: 32000,
    capabilities: ["text", "code", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "mistralai/ministral-8b",
    displayName: "Ministral 3 8B",
    icon: "Sparkles",
    contextLength: 128000,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "mistralai/ministral-3b",
    displayName: "Ministral 3 3B",
    icon: "Sparkles",
    contextLength: 128000,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "mistralai/codestral-2508",
    displayName: "Codestral",
    icon: "Sparkles",
    contextLength: 32000,
    capabilities: ["code"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "mistralai/devstral-medium",
    displayName: "Devstral 2",
    icon: "Sparkles",
    contextLength: 128000,
    capabilities: ["code"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "xiaomi/mimo-v2.5",
    displayName: "MiMo v2.5",
    icon: "Sparkles",
    contextLength: 128000,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "xiaomi/mimo-v2.5-pro",
    displayName: "MiMo v2.5 Pro",
    icon: "Sparkles",
    contextLength: 128000,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "minimax/minimax-m2",
    displayName: "MiniMax M2",
    icon: "Sparkles",
    contextLength: 128000,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "minimax/minimax-m2.1",
    displayName: "MiniMax M2.1",
    icon: "Sparkles",
    contextLength: 204000,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "minimax/minimax-m2.7",
    displayName: "MiniMax M2.7",
    icon: "Sparkles",
    contextLength: 128000,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "deepseek/deepseek-v4-pro",
    displayName: "DeepSeek v4 Pro",
    icon: "Sparkles",
    contextLength: 1000000,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "deepseek/deepseek-v4-flash",
    displayName: "DeepSeek v4 Flash",
    icon: "Sparkles",
    contextLength: 1000000,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "stealth/ox-alpha-free",
    displayName: "OX Alpha",
    icon: "Sparkles",
    logoUrl: "https://cdn.xtrouter.com/tag-images/Stealth.svg",
    contextLength: 1000000,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
];

/**
 * Mistral models — La Plateforme free "Experiment" tier (rate-limited, all
 * models available). Endpoint is OpenAI-compatible:
 * https://api.mistral.ai/v1/chat/completions
 * Verified live against a real Mistral key (Aug 2026) — pixtral/nemo aliases
 * from earlier catalogs are gone; check GET /v1/models to refresh this.
 */
const MISTRAL_MODELS: ModelDef[] = [
  {
    provider: "mistral",
    modelId: "mistral-small-latest",
    displayName: "Mistral Small",
    icon: "Wind",
    contextLength: 32000,
    capabilities: ["text", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "mistral",
    modelId: "mistral-large-latest",
    displayName: "Mistral Large",
    icon: "Wind",
    contextLength: 128000,
    capabilities: ["text", "code", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "mistral",
    modelId: "ministral-8b-latest",
    displayName: "Ministral 8B",
    icon: "Wind",
    contextLength: 128000,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "mistral",
    modelId: "codestral-latest",
    displayName: "Codestral",
    icon: "Wind",
    contextLength: 32000,
    capabilities: ["code"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "mistral",
    modelId: "pixtral-12b-2409",
    displayName: "Pixtral 12B",
    icon: "Wind",
    contextLength: 128000,
    capabilities: ["text", "vision", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "mistral",
    modelId: "devstral-latest",
    displayName: "Devstral",
    icon: "Wind",
    contextLength: 128000,
    capabilities: ["code"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
];

/**
 * Gemini models — official free API tier only (Pro is paid-only as of 2026).
 * https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent
 * Verified live against a real Gemini key (Aug 2026) — 2.5 Flash/Flash-Lite
 * were retired for new users mid-2026 in favor of the 3.x line below.
 */
const GEMINI_MODELS: ModelDef[] = [
  {
    provider: "gemini",
    modelId: "gemini-3.6-flash",
    displayName: "Gemini 3.6 Flash",
    icon: "Gem",
    contextLength: 1000000,
    capabilities: ["text", "vision", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "gemini",
    modelId: "gemini-3.5-flash-lite",
    displayName: "Gemini 3.5 Flash-Lite",
    icon: "Gem",
    contextLength: 1000000,
    capabilities: ["text", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
];

/**
 * OpenRouter — single OpenAI-compatible endpoint that proxies to many
 * upstream providers, model ids namespaced as "{provider}/{model}":
 * https://openrouter.ai/api/v1/chat/completions
 * Only ":free" variants are listed here (verified live against GET /api/v1/models,
 * Aug 2026) — free-tier rate limits are low and the catalog turns over, so
 * re-check periodically.
 */
const OPENROUTER_MODELS: ModelDef[] = [
  {
    provider: "openrouter",
    modelId: "z-ai/glm-5.2:free",
    displayName: "GLM 5.2",
    icon: "Route",
    contextLength: 256000,
    capabilities: ["text", "code", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "openrouter",
    modelId: "openai/gpt-oss-20b:free",
    displayName: "GPT-OSS 20B",
    icon: "Route",
    contextLength: 131072,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "openrouter",
    modelId: "nvidia/nemotron-3-ultra-550b-a55b:free",
    displayName: "Nemotron 3 Ultra",
    icon: "Route",
    contextLength: 1000000,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "openrouter",
    modelId: "nvidia/nemotron-3-super-120b-a12b:free",
    displayName: "Nemotron 3 Super",
    icon: "Route",
    contextLength: 262144,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "openrouter",
    modelId: "google/gemma-4-31b-it:free",
    displayName: "Gemma 4 31B",
    icon: "Route",
    contextLength: 262144,
    capabilities: ["text", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "openrouter",
    modelId: "nvidia/nemotron-nano-12b-v2-vl:free",
    displayName: "Nemotron Nano 12B VL",
    icon: "Route",
    contextLength: 128000,
    capabilities: ["text", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "openrouter",
    modelId: "poolside/laguna-s-2.1",
    displayName: "Laguna S 2.1",
    icon: "Route",
    contextLength: 1048576,
    capabilities: ["text", "code"],
    free: false,
    supportsStreaming: true,
    supportsVision: false,
  },
];

/**
 * Puter.js — https://js.puter.com/v2/, an in-browser SDK loaded directly by the frontend
 * (see lib/puterClient.ts) rather than proxied through the Worker: Puter funds inference
 * itself and authenticates the user with its own one-time sign-in popup, so no Worker
 * secret or key of ours is involved. Puter's live catalog is 800+ models (fetched via
 * puterClient.ts's listPuterModels) — far too many to curate here, so there's no static
 * list: ModelSelector lets the user browse the full catalog and star ones to keep, and
 * those starred picks (settings.puterFavoriteModels) are the only ones injected below via
 * setPuterFavorites, the same way user-added `customModels` are.
 */

export const ALL_MODELS: ModelDef[] = [
  ...XKIRO_MODELS,
  ...MISTRAL_MODELS,
  ...GEMINI_MODELS,
  ...OPENROUTER_MODELS,
];

export const DEFAULT_MODEL_ID = "mistralai/mistral-small-2603";

/** Every model except the free default requires signing in — see the plan's
 * "Sign-in gating" slice. Checked by ModelSelector, SettingsModal's default-model
 * picker, ChatMessage's regenerate-with menu, and defensively in runStream.ts. */
export function isModelGated(model: Pick<ModelDef, "modelId" | "provider">): boolean {
  return !(model.provider === "xkiro" && model.modelId === DEFAULT_MODEL_ID);
}

export const PROVIDER_LABELS: Record<Provider, string> = {
  xkiro: "xKiro",
  mistral: "Mistral",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  puter: "Puter.js",
  custom: "Custom",
};

/**
 * User-added models (Settings → Custom Models) live in `settings.customModels`,
 * which only React components can reach directly via the zustand store. Every
 * other consumer here — chatStore's own default-model logic, the non-React
 * modes — needs them too, and threading a `customModels` param through every
 * `findModel`/`getDefaultModel` call site would touch a dozen files for no
 * real benefit. Instead chatStore pushes the current list in here once,
 * on init and on every settings update, and everything below reads through
 * `allModels()` — same pattern as a small in-memory cache kept in sync by
 * its one writer.
 */
let customModels: ModelDef[] = [];

export function setCustomModels(models: ModelDef[]): void {
  customModels = models;
}

/** Same pattern as `customModels` above, for the models the user has starred out of
 * Puter.js's full live catalog — see ModelSelector's "Browse all Puter models" panel. */
let puterFavorites: ModelDef[] = [];

export function setPuterFavorites(models: ModelDef[]): void {
  puterFavorites = models;
}

function allModels(): ModelDef[] {
  return customModels.length || puterFavorites.length ? [...ALL_MODELS, ...customModels, ...puterFavorites] : ALL_MODELS;
}

/** Flat list of every selectable model — built-ins plus whatever the user added in Settings. */
export function getAllModels(): ModelDef[] {
  return allModels();
}

export function modelsByProvider(): Record<Provider, ModelDef[]> {
  const grouped = {} as Record<Provider, ModelDef[]>;
  for (const m of allModels()) {
    (grouped[m.provider] ??= []).push(m);
  }
  return grouped;
}

export function findModel(modelId: string): ModelDef | undefined {
  return allModels().find((m) => m.modelId === modelId);
}

export function getDefaultModel(overrideId?: string): ModelDef {
  return (overrideId ? findModel(overrideId) : undefined) ?? findModel(DEFAULT_MODEL_ID) ?? ALL_MODELS[0];
}

export function randomModelPair(): [ModelDef, ModelDef] {
  const pool = allModels().filter((m) => m.free && m.supportsStreaming && !m.knownBroken);
  const a = pool[Math.floor(Math.random() * pool.length)];
  let b = pool[Math.floor(Math.random() * pool.length)];
  let guard = 0;
  while (b.modelId === a.modelId && pool.length > 1 && guard < 20) {
    b = pool[Math.floor(Math.random() * pool.length)];
    guard++;
  }
  return [a, b];
}
