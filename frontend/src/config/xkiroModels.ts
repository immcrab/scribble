import type { ModelDef } from "../types";

/**
 * xKiro model catalog — EDIT THIS FILE ONLY to add/remove xKiro models.
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
 * QWEN OUTAGE (still open as of 2026-08-20, re-tested — not fixed): xKiro's
 * Qwen route 200s an SSE stream with `data: {"error":"A server error
 * occurred. Please try again."}` for every `qwen/*` model. Confirmed on all
 * nine Qwen ids; every other xKiro model (Mistral/MiMo/MiniMax/DeepSeek) is
 * unaffected — this is an outage on xKiro's Qwen backend, not our adapter.
 * The three kept below (`knownBroken` set) are the ones actually wanted in
 * the selector; the other six Qwen ids stay out until asked for. To clear a
 * `knownBroken` flag once fixed: `curl https://api.xkiro.com/v1/chat/completions
 * -d '{"model":"qwen/<id>",...}'` and confirm it streams real content, then
 * delete that model's `knownBroken` line.
 */
export const XKIRO_MODELS: ModelDef[] = [
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
    knownBroken: "xKiro's Qwen backend is erroring on every request (server-side outage, since ~Aug 2026) — this may fail. Retry later.",
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
    knownBroken: "xKiro's Qwen backend is erroring on every request (server-side outage, since ~Aug 2026) — this may fail. Retry later.",
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
    knownBroken: "xKiro's Qwen backend is erroring on every request (server-side outage, since ~Aug 2026) — this may fail. Retry later.",
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
];