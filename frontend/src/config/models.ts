import type { ModelDef, Provider } from "../types";
import { XKIRO_MODELS } from "./xkiroModels";

/**
 * Groq models — official free dev tier, OpenAI-compatible endpoint
 * https://api.groq.com/openai/v1/chat/completions
 * Catalog verified against Groq's published free-tier model list. Groq also
 * exposes GET /openai/v1/models if you want to refresh this at runtime.
 */
const GROQ_MODELS: ModelDef[] = [
  {
    provider: "groq",
    modelId: "llama-3.3-70b-versatile",
    displayName: "Llama 3.3 70B",
    icon: "Zap",
    contextLength: 128000,
    capabilities: ["text", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "groq",
    modelId: "llama-3.1-8b-instant",
    displayName: "Llama 3.1 8B Instant",
    icon: "Zap",
    contextLength: 128000,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "groq",
    modelId: "meta-llama/llama-4-scout-17b-16e-instruct",
    displayName: "Llama 4 Scout",
    icon: "Zap",
    contextLength: 128000,
    capabilities: ["text", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "groq",
    modelId: "openai/gpt-oss-120b",
    displayName: "GPT-OSS 120B",
    icon: "Zap",
    contextLength: 128000,
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
    contextLength: 128000,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "groq",
    modelId: "deepseek-r1-distill-llama-70b",
    displayName: "DeepSeek R1 Distill 70B",
    icon: "Zap",
    contextLength: 128000,
    capabilities: ["text", "reasoning"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "groq",
    modelId: "qwen/qwen3-32b",
    displayName: "Qwen3 32B",
    icon: "Zap",
    contextLength: 128000,
    capabilities: ["text", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
];

/**
 * Mistral models — La Plateforme free "Experiment" tier (rate-limited, all
 * models available; heavily throttled). Endpoint is OpenAI-compatible:
 * https://api.mistral.ai/v1/chat/completions
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
    modelId: "open-mistral-nemo",
    displayName: "Mistral Nemo",
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
    capabilities: ["text", "vision"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
];

/**
 * Gemini models — official free API tier only (Pro is paid-only as of 2026).
 * https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent
 */
const GEMINI_MODELS: ModelDef[] = [
  {
    provider: "gemini",
    modelId: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    icon: "Gem",
    contextLength: 1000000,
    capabilities: ["text", "vision", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    provider: "gemini",
    modelId: "gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash-Lite",
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
