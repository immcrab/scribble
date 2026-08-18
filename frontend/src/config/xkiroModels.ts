import type { ModelDef } from "../types";

/**
 * xKiro model catalog — EDIT THIS FILE ONLY to add/remove xKiro models.
 * Nothing else in the app needs to change: xKiro is OpenAI-compatible, so any
 * modelId listed here is sent as-is to https://api.xkiro.com/v1/chat/completions
 * by the Worker's xkiro adapter.
 *
 * Replace the entries below with your full xKiro free-model list. Keep the
 * shape identical — modelId must match xKiro's model id exactly.
 */
export const XKIRO_MODELS: ModelDef[] = [
  {
    provider: "xkiro",
    modelId: "xkiro-llama-3.3-70b",
    displayName: "xKiro Llama 3.3 70B",
    icon: "Sparkles",
    contextLength: 128000,
    capabilities: ["text", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "xkiro-qwen2.5-72b",
    displayName: "xKiro Qwen2.5 72B",
    icon: "Sparkles",
    contextLength: 32000,
    capabilities: ["text", "code"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    provider: "xkiro",
    modelId: "xkiro-mixtral-8x7b",
    displayName: "xKiro Mixtral 8x7B",
    icon: "Sparkles",
    contextLength: 32000,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  },
];
