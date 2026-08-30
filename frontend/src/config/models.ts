import type { ModelDef, Provider } from "../types";
import { isLocalDev } from "../lib/devMode";

// Adding a model here? Also add a one-line entry to modelDocs.ts — see ADD_NEW_MODEL.md.

/**
 * xKiro model catalog — EDIT THIS BLOCK ONLY to add/remove xKiro models.
 * Nothing else in the app needs to change: xKiro is OpenAI-compatible, so any
 * modelId listed here is sent as-is to https://api.xkiro.com/v1/chat/completions
 * by the Worker's xkiro adapter.
 *
 * This is every model xKiro's public catalog marks `access_tier: "free"`
 * (Aug 2026) — GET /v1/models is public/unauthenticated and now carries that
 * field directly, so no per-key probing is needed to know what's free:
 *   curl -s https://api.xkiro.com/v1/models | jq '[.data[] | select(.access_tier=="free") | .id]'
 * Some vendors (Qwen) only expose a `:free` id — a same-named bare id exists
 * too but resolves to a paid/premium model, so the `:free` suffix is load-
 * bearing, not decorative. Other vendors (Mistral, MiniMax, DeepSeek) have no
 * paid twin — the bare id is the free one. Re-run the curl above periodically;
 * xKiro's catalog turns over.
 *
 * QWEN FLAKINESS (2026-08-20): xKiro's Qwen route intermittently (~50% of
 * calls, observed) 200s an SSE stream whose first frame is `data:
 * {"error":"A server error occurred. Please try again."}` instead of real
 * content — a transient failure on xKiro's end, not our adapter. The Worker's
 * xkiro adapter (worker/src/adapters/xkiro.ts) retries that specific error up
 * to 3 times before surfacing it (applies to every model, not just Qwen),
 * which brought the observed end-to-end failure rate down to ~5% — in line
 * with any other model's occasional hiccup, so no `knownBroken` flags here.
 */
const XKIRO_MODELS: ModelDef[] = [
  {
    provider: "xkiro",
    modelId: "qwen/qwen3.8-max:free",
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
    modelId: "qwen/qwen3.7-max:free",
    displayName: "Qwen3.7 Max",
    icon: "Sparkles",
    contextLength: 1000000,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3.7-plus:free",
    displayName: "Qwen3.7 Plus",
    icon: "Sparkles",
    contextLength: 1000000,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3.6-max-preview:free",
    displayName: "Qwen3.6 Max Preview",
    icon: "Sparkles",
    contextLength: 262144,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3.6-plus:free",
    displayName: "Qwen3.6 Plus",
    icon: "Sparkles",
    contextLength: 1000000,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3.6-27b:free",
    displayName: "Qwen3.6 27B",
    icon: "Sparkles",
    contextLength: 262144,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3.6-35b-a3b:free",
    displayName: "Qwen3.6 35B A3B",
    icon: "Sparkles",
    contextLength: 262144,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3.5-397b-a17b:free",
    displayName: "Qwen3.5 397B A17B",
    icon: "Sparkles",
    contextLength: 262144,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3.5-plus:free",
    displayName: "Qwen3.5 Plus",
    icon: "Sparkles",
    contextLength: 1000000,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3.5-flash:free",
    displayName: "Qwen3.5 Flash",
    icon: "Sparkles",
    contextLength: 1000000,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3.5-omni-plus:free",
    displayName: "Qwen3.5 Omni Plus",
    icon: "Sparkles",
    contextLength: 262144,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3.5-omni-flash:free",
    displayName: "Qwen3.5 Omni Flash",
    icon: "Sparkles",
    contextLength: 262144,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3-max:free",
    displayName: "Qwen3 Max",
    icon: "Sparkles",
    contextLength: 262144,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3-coder-plus:free",
    displayName: "Qwen3 Coder Plus",
    icon: "Sparkles",
    contextLength: 1048576,
    capabilities: ["text", "reasoning", "code", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3-vl-plus:free",
    displayName: "Qwen3 VL Plus",
    icon: "Sparkles",
    contextLength: 262144,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen3-omni-flash:free",
    displayName: "Qwen3 Omni Flash",
    icon: "Sparkles",
    contextLength: 262144,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "qwen/qwen-plus-2025-07-28:free",
    displayName: "Qwen Plus 0728",
    icon: "Sparkles",
    contextLength: 131072,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "mistralai/mistral-large-2512",
    displayName: "Mistral Large 3",
    icon: "Sparkles",
    contextLength: 256000,
    capabilities: ["text", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "mistralai/mistral-medium-3.5",
    displayName: "Mistral Medium 3.5",
    icon: "Sparkles",
    contextLength: 256000,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "mistralai/mistral-small-2603",
    displayName: "Mistral Small 4",
    icon: "Sparkles",
    contextLength: 256000,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "mistralai/ministral-14b",
    displayName: "Ministral 3 14B",
    icon: "Sparkles",
    contextLength: 256000,
    capabilities: ["text", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "mistralai/ministral-8b",
    displayName: "Ministral 3 8B",
    icon: "Sparkles",
    contextLength: 256000,
    capabilities: ["text", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "mistralai/ministral-3b",
    displayName: "Ministral 3 3B",
    icon: "Sparkles",
    contextLength: 128000,
    capabilities: ["text", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "xkiro",
    modelId: "mistralai/codestral-2508",
    displayName: "Codestral",
    icon: "Sparkles",
    contextLength: 256000,
    capabilities: ["text", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "mistralai/devstral-medium",
    displayName: "Devstral 2",
    icon: "Sparkles",
    contextLength: 256000,
    capabilities: ["text", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "minimax/minimax-m2.7",
    displayName: "MiniMax M2.7",
    icon: "Sparkles",
    contextLength: 204800,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "minimax/minimax-m2.7-highspeed",
    displayName: "MiniMax M2.7 Highspeed",
    icon: "Sparkles",
    contextLength: 204800,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "minimax/minimax-m2.5",
    displayName: "MiniMax M2.5",
    icon: "Sparkles",
    contextLength: 204800,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "minimax/minimax-m2.5-highspeed",
    displayName: "MiniMax M2.5 Highspeed",
    icon: "Sparkles",
    contextLength: 204800,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "minimax/minimax-m2.1",
    displayName: "MiniMax M2.1",
    icon: "Sparkles",
    contextLength: 204800,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "minimax/minimax-m2.1-highspeed",
    displayName: "MiniMax M2.1 Highspeed",
    icon: "Sparkles",
    contextLength: 204800,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "minimax/minimax-m2",
    displayName: "MiniMax M2",
    icon: "Sparkles",
    contextLength: 204800,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "deepseek/deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    icon: "Sparkles",
    contextLength: 1048576,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "deepseek/deepseek-v4-flash",
    displayName: "DeepSeek V4 Flash",
    icon: "Sparkles",
    contextLength: 1048576,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "deepseek/deepseek-v3.2",
    displayName: "DeepSeek V3.2",
    icon: "Sparkles",
    contextLength: 131072,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "deepseek/deepseek-chat-v3.1",
    displayName: "DeepSeek V3.1",
    icon: "Sparkles",
    contextLength: 163840,
    capabilities: ["text", "reasoning"],
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
    contextLength: 1048576,
    capabilities: ["text", "reasoning", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
];

/**
 * Mistral models — La Plateforme free "Experiment" tier (phone-verified, no
 * card, ~1B tokens/month, rate-limited): every La Plateforme chat model is
 * usable on it, so this list mirrors Mistral's full current chat lineup.
 * Endpoint is OpenAI-compatible: https://api.mistral.ai/v1/chat/completions
 * Re-verified against Mistral's live model list (Aug 2026): the pixtral/nemo
 * aliases are gone, the Ministral line is now "Ministral 3" (14B/8B/3B), and
 * Small/Medium/Large are all multimodal hybrid-reasoning models. Refresh from
 * https://docs.mistral.ai/models/overview + GET /v1/models.
 */
const MISTRAL_MODELS: ModelDef[] = [
  {
    provider: "mistral",
    modelId: "mistral-large-latest",
    displayName: "Mistral Large 3",
    icon: "Wind",
    contextLength: 262000,
    capabilities: ["text", "vision", "code", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "mistral",
    modelId: "mistral-medium-latest",
    displayName: "Mistral Medium 3.5",
    icon: "Wind",
    contextLength: 256000,
    capabilities: ["text", "vision", "code", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "mistral",
    modelId: "mistral-small-latest",
    displayName: "Mistral Small 4",
    icon: "Wind",
    contextLength: 256000,
    capabilities: ["text", "vision", "code", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "mistral",
    modelId: "ministral-3-14b-latest",
    displayName: "Ministral 3 14B",
    icon: "Wind",
    contextLength: 256000,
    capabilities: ["text", "vision", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "mistral",
    modelId: "ministral-3-8b-latest",
    displayName: "Ministral 3 8B",
    icon: "Wind",
    contextLength: 256000,
    capabilities: ["text", "vision", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "mistral",
    modelId: "ministral-3-3b-latest",
    displayName: "Ministral 3 3B",
    icon: "Wind",
    contextLength: 128000,
    capabilities: ["text", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "mistral",
    modelId: "codestral-latest",
    displayName: "Codestral",
    icon: "Wind",
    contextLength: 256000,
    capabilities: ["text", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
];

/**
 * Gemini models — official free API tier only. As of 2026 the free tier covers
 * the Flash and Flash-Lite lines (10-15 RPM, 1M-token context); Pro is
 * paid-only. The 2.5 Flash/Flash-Lite models were retired for new keys
 * mid-2026, so this is every free-tier 3.x Flash/Flash-Lite id live in Aug
 * 2026 — check https://ai.google.dev/gemini-api/docs/models + the AI Studio
 * rate-limit page to refresh.
 * https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent
 */
const GEMINI_MODELS: ModelDef[] = [
  {
    provider: "gemini",
    modelId: "gemini-3.7-flash",
    displayName: "Gemini 3.7 Flash",
    icon: "Gem",
    contextLength: 1000000,
    capabilities: ["text", "vision", "code", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
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
    modelId: "gemini-3.5-flash",
    displayName: "Gemini 3.5 Flash",
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
  {
    provider: "gemini",
    modelId: "gemini-3.1-flash-lite",
    displayName: "Gemini 3.1 Flash-Lite",
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
 * Only free variants belong here — that's the ":free"-suffixed ids plus a
 * couple ("stealth/ox-alpha", "openrouter/free") OpenRouter lists as free
 * without the suffix. This mirrors OpenRouter's live free-models listing
 * (openrouter.ai/models?fmt=table&supported_parameters=free, Aug 2026); the
 * free tier turns over fast, so re-check against:
 *   curl -s https://openrouter.ai/api/v1/models | jq '[.data[] | select((.id|endswith(":free")) or (.pricing.prompt=="0")) | .id]'
 * Content-safety / moderation classifiers on that list (e.g.
 * nvidia/nemotron-3.5-content-safety:free) are deliberately left out — not chat models.
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
    modelId: "minimax/minimax-m3:free",
    displayName: "MiniMax M3",
    icon: "Route",
    contextLength: 1000000,
    capabilities: ["text", "vision", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "openrouter",
    modelId: "thinkingmachines/inkling:free",
    displayName: "Inkling",
    icon: "Route",
    contextLength: 1048576,
    capabilities: ["text", "vision", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "openrouter",
    modelId: "thinkingmachines/inkling-small:free",
    displayName: "Inkling Small",
    icon: "Route",
    contextLength: 1048576,
    capabilities: ["text", "vision", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "openrouter",
    modelId: "minimax/minimax-m2.7:free",
    displayName: "MiniMax M2.7",
    icon: "Route",
    contextLength: 204800,
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
    modelId: "google/gemma-4-26b-a4b-it:free",
    displayName: "Gemma 4 26B A4B",
    icon: "Route",
    contextLength: 262144,
    capabilities: ["text", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "openrouter",
    modelId: "nvidia/nemotron-3.5-lightning:free",
    displayName: "Nemotron 3.5 Lightning",
    icon: "Route",
    contextLength: 1000000,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "openrouter",
    modelId: "cohere/north-mini-code:free",
    displayName: "North Mini Code",
    icon: "Route",
    contextLength: 256000,
    capabilities: ["text", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "openrouter",
    modelId: "liquid/lfm-2.5-2.6b:free",
    displayName: "LFM2.5 2.6B",
    icon: "Route",
    contextLength: 65536,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "openrouter",
    modelId: "stealth/ox-alpha",
    displayName: "Ox Alpha",
    icon: "Route",
    contextLength: 1000000,
    capabilities: ["text", "vision", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "openrouter",
    modelId: "dots-studio/dots-3-note-preview:free",
    displayName: "Dots3-Note Preview",
    icon: "Route",
    contextLength: 512000,
    capabilities: ["text", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "openrouter",
    modelId: "poolside/laguna-s-2.1:free",
    displayName: "Laguna S 2.1",
    icon: "Route",
    contextLength: 262144,
    capabilities: ["text", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "openrouter",
    modelId: "poolside/laguna-xs-2.1:free",
    displayName: "Laguna XS 2.1",
    icon: "Route",
    contextLength: 262144,
    capabilities: ["text", "code"],
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
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "openrouter",
    modelId: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    displayName: "Nemotron 3 Nano Omni",
    icon: "Route",
    contextLength: 256000,
    capabilities: ["text", "vision", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "openrouter",
    modelId: "openrouter/free",
    displayName: "Free Models Router",
    icon: "Route",
    contextLength: 200000,
    capabilities: ["text", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
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

/**
 * Catalog size as a rounded-down "N+" string (e.g. 56 built-ins -> "50+"),
 * for docs copy and marketing/meta text that shouldn't churn on every single
 * add. Uses ALL_MODELS only (built-ins), so it's stable regardless of a user's
 * custom models or Puter favorites.
 *
 * MAINTENANCE: whenever this crosses the next multiple of 10, also bump the
 * hard-coded "N+ models" strings that can't call this — the <meta> tags in
 * frontend/index.html and the public marketing pages. See ADD_NEW_MODEL.md.
 */
export function catalogSizeLabel(): string {
  return `${Math.floor(ALL_MODELS.length / 10) * 10}+`;
}

/** Every model except the free default requires signing in — see the plan's
 * "Sign-in gating" slice. Checked by ModelSelector, SettingsModal's default-model
 * picker, ChatMessage's regenerate-with menu, and defensively in runStream.ts. */
export function isModelGated(model: Pick<ModelDef, "modelId" | "provider">): boolean {
  if (isLocalDev()) return false; // local dev: every model open, no sign-in needed
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

/**
 * Admin-curated overlay on the catalog — global, not per-browser. `adminAddedModels`
 * are extra "official" models everyone sees; `hiddenModelKeys` are `"provider:modelId"`
 * keys removed from the catalog for everyone. Both are pushed in here by chatStore from
 * the RTDB `catalog/v1` subscription (see lib/catalogSync.ts), same push-not-thread
 * pattern as `customModels`. Edited only from pages/AdminPage.tsx.
 */
let adminAddedModels: ModelDef[] = [];
let hiddenModelKeys: string[] = [];

export function setAdminCatalog(added: ModelDef[], hiddenKeys: string[]): void {
  adminAddedModels = added;
  // The default model is the one every un-signed-in visitor falls back to — never let it
  // be hidden, however the admin's list arrives.
  hiddenModelKeys = hiddenKeys.filter((k) => k !== `xkiro:${DEFAULT_MODEL_ID}`);
}

function allModels(): ModelDef[] {
  if (!customModels.length && !puterFavorites.length && !adminAddedModels.length && !hiddenModelKeys.length) {
    return ALL_MODELS;
  }
  // Settings → Custom Models can also point a manually-added model at provider "puter" —
  // if that happens to share an id with one the user separately favorited from the browse
  // panel, it'd otherwise render (and need unfavoriting) twice. Later entries win, so a
  // favorited pick's fresher data overrides a stale custom-model entry sharing its id.
  const byKey = new Map<string, ModelDef>();
  for (const m of [...ALL_MODELS, ...adminAddedModels, ...customModels, ...puterFavorites]) {
    byKey.set(`${m.provider}:${m.modelId}`, m);
  }
  // Admin removals win last — a user's own custom model keeps a different id, so this only
  // ever bites the built-in / admin-added entries the admin actually meant to drop.
  for (const key of hiddenModelKeys) byKey.delete(key);
  return Array.from(byKey.values());
}

/** `"{provider}:{modelId}"` — the key format used by `hiddenModelKeys` and the admin page. */
export function modelKey(m: Pick<ModelDef, "provider" | "modelId">): string {
  return `${m.provider}:${m.modelId}`;
}

/** Built-in catalog plus the admin's added models, before per-browser custom models or
 * hidden-key removal — what the `/admin` page lists as "everything you can publish or hide". */
export function catalogWithAdminAdditions(): ModelDef[] {
  const byKey = new Map<string, ModelDef>();
  for (const m of [...ALL_MODELS, ...adminAddedModels]) byKey.set(modelKey(m), m);
  return Array.from(byKey.values());
}

/** Keys of models the admin has published (as opposed to built-ins) — the admin page shows
 * these with "delete" rather than "hide", since hiding an added model just orphans it. */
export function adminAddedKeys(): string[] {
  return adminAddedModels.map(modelKey);
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
