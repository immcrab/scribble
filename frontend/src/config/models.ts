import type { ModelDef, Provider } from "../types";
import { XKIRO_MODELS } from "./xkiroModels";

/**
 * Groq models — official free dev tier, OpenAI-compatible endpoint
 * https://api.groq.com/openai/v1/chat/completions
 * Verified live against a real Groq free-tier key (Aug 2026) — Groq's
 * catalog turns over fast, so re-check GET /openai/v1/models periodically.
 */
const GROQ_MODELS: ModelDef[] = [
  {
    provider: "groq",
    modelId: "groq/compound",
    displayName: "Compound",
    icon: "Zap",
    contextLength: 131072,
    capabilities: ["text", "reasoning", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "groq",
    modelId: "groq/compound-mini",
    displayName: "Compound Mini",
    icon: "Zap",
    contextLength: 131072,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "groq",
    modelId: "openai/gpt-oss-120b",
    displayName: "GPT-OSS 120B",
    icon: "Zap",
    contextLength: 131072,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "groq",
    modelId: "openai/gpt-oss-20b",
    displayName: "GPT-OSS 20B",
    icon: "Zap",
    contextLength: 131072,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "groq",
    modelId: "qwen/qwen3.6-27b",
    displayName: "Qwen3.6 27B",
    icon: "Zap",
    contextLength: 131072,
    capabilities: ["text", "reasoning", "code"],
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

export const ALL_MODELS: ModelDef[] = [
  ...XKIRO_MODELS,
  ...GROQ_MODELS,
  ...MISTRAL_MODELS,
  ...GEMINI_MODELS,
];

export const PROVIDER_LABELS: Record<Provider, string> = {
  xkiro: "xKiro",
  groq: "Groq",
  mistral: "Mistral",
  gemini: "Google Gemini",
};

export function modelsByProvider(): Record<Provider, ModelDef[]> {
  const grouped = {} as Record<Provider, ModelDef[]>;
  for (const m of ALL_MODELS) {
    (grouped[m.provider] ??= []).push(m);
  }
  return grouped;
}

export function findModel(modelId: string): ModelDef | undefined {
  return ALL_MODELS.find((m) => m.modelId === modelId);
}

export function randomModelPair(): [ModelDef, ModelDef] {
  const pool = ALL_MODELS.filter((m) => m.free && m.supportsStreaming);
  const a = pool[Math.floor(Math.random() * pool.length)];
  let b = pool[Math.floor(Math.random() * pool.length)];
  let guard = 0;
  while (b.modelId === a.modelId && pool.length > 1 && guard < 20) {
    b = pool[Math.floor(Math.random() * pool.length)];
    guard++;
  }
  return [a, b];
}
