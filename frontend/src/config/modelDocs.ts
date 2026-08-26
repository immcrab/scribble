/**
 * Short blurbs for the public /docs/{model} pages (src/pages/DocsPage.tsx).
 *
 * IMPORTANT: when a new model is added to models.ts, add a
 * matching entry here too, keyed by the exact same `modelId`. See
 * ADD_NEW_MODEL.md in this folder for the full checklist. A model without an
 * entry here still shows up in the app and gets an auto-generated docs page
 * from its `capabilities` — but a hand-written one-liner reads much better.
 */
export const MODEL_DOCS: Record<string, string> = {
  // Mistral
  "mistral-small-latest": "Mistral's compact everyday model — fast, cheap, good for straightforward text and code tasks.",
  "mistral-large-latest": "Mistral's flagship — strongest reasoning and code in their lineup.",
  "ministral-8b-latest": "Small, efficient Mistral model tuned for low-latency simple tasks.",
  "codestral-latest": "Mistral's dedicated coding model — trained specifically for code generation and completion.",
  "pixtral-12b-2409": "Mistral's vision model — understands images and documents alongside text and code.",
  "devstral-latest": "Mistral model tuned for agentic coding — multi-file edits and tool-driven dev workflows.",

  // Gemini
  "gemini-3.6-flash": "Google's fast Gemini tier — huge 1M-token context, handles text, images, and code.",
  "gemini-3.5-flash-lite": "Even lighter/faster Gemini — trades some capability for speed, still reads images.",

  // OpenRouter
  "z-ai/glm-5.2:free": "Zhipu's GLM 5.2 via OpenRouter — strong reasoning and code with a 256K context window.",
  "openai/gpt-oss-20b:free": "OpenAI's open-weight 20B model, free tier via OpenRouter.",
  "nvidia/nemotron-3-ultra-550b-a55b:free": "NVIDIA's largest Nemotron — huge 1M context for long-document reasoning.",
  "nvidia/nemotron-3-super-120b-a12b:free": "Mid-size NVIDIA Nemotron — big 256K context, general text tasks.",
  "google/gemma-4-31b-it:free": "Google's open Gemma 4, instruction-tuned — reads text and images.",
  "nvidia/nemotron-nano-12b-v2-vl:free": "Small NVIDIA vision-language model — lightweight image understanding.",
  "poolside/laguna-s-2.1": "Poolside's Laguna model — huge context window geared toward code-heavy work.",

  // xKiro
  "qwen/qwen3.8-max:free": "Qwen's largest current model via xKiro — top-tier reasoning and vision at 1M context.",
  "qwen/qwen3.7-max:free": "Qwen 3.7 Max — large-context reasoning model, no vision.",
  "qwen/qwen3.7-plus:free": "Qwen 3.7 Plus — strong reasoning and vision at 1M context.",
  "qwen/qwen3.6-max-preview:free": "Preview of Qwen's 3.6 Max reasoning model.",
  "qwen/qwen3.6-plus:free": "Qwen 3.6 Plus — reasoning and vision at 1M context.",
  "qwen/qwen3.6-27b:free": "Smaller Qwen 3.6 model — reasoning and vision, lighter weight.",
  "qwen/qwen3.6-35b-a3b:free": "Qwen 3.6 mixture-of-experts model — reasoning and vision.",
  "qwen/qwen3.5-397b-a17b:free": "Large Qwen 3.5 mixture-of-experts model — reasoning and vision.",
  "qwen/qwen3.5-plus:free": "Qwen 3.5 Plus — reasoning and vision at 1M context.",
  "qwen/qwen3.5-flash:free": "Faster Qwen 3.5 — vision-capable, tuned for quick responses over max reasoning.",
  "qwen/qwen3.5-omni-plus:free": "Qwen 3.5 Omni Plus — multimodal reasoning and vision.",
  "qwen/qwen3.5-omni-flash:free": "Faster Qwen 3.5 Omni — multimodal, lower latency.",
  "qwen/qwen3-max:free": "Qwen 3 Max — flagship reasoning and vision model.",
  "qwen/qwen3-coder-plus:free": "Qwen's dedicated coding model — built for generation and multi-file editing.",
  "qwen/qwen3-vl-plus:free": "Qwen 3 vision-language model — tuned for image understanding.",
  "qwen/qwen3-omni-flash:free": "Qwen 3 Omni Flash — fast multimodal model.",
  "qwen/qwen-plus-2025-07-28:free": "Qwen Plus snapshot build — reasoning and vision.",
  "mistralai/mistral-large-2512": "Mistral's flagship via xKiro — vision-capable, large context.",
  "mistralai/mistral-medium-3.5": "Mistral Medium 3.5 via xKiro — reasoning and vision, mid-tier cost.",
  "mistralai/mistral-small-2603": "Mistral Small 4 via xKiro — the app's free default, balanced text/reasoning/vision.",
  "mistralai/ministral-14b": "Mid-size Mistral model — vision-capable, no reasoning mode.",
  "mistralai/ministral-8b": "Compact Mistral model for simple, fast tasks — vision-capable.",
  "mistralai/ministral-3b": "Smallest Mistral available here — lowest latency, lightest tasks only.",
  "mistralai/codestral-2508": "Mistral's Codestral, latest revision — code-focused generation.",
  "mistralai/devstral-medium": "Mistral's Devstral — agentic, multi-step coding workflows.",
  "minimax/minimax-m2.7": "Latest MiniMax M2-series revision — reasoning-capable.",
  "minimax/minimax-m2.7-highspeed": "MiniMax M2.7, high-speed variant — same reasoning, lower latency.",
  "minimax/minimax-m2.5": "MiniMax M2.5 — reasoning-capable text model.",
  "minimax/minimax-m2.5-highspeed": "MiniMax M2.5, high-speed variant.",
  "minimax/minimax-m2.1": "MiniMax M2.1 — reasoning-capable, bigger context than M2.",
  "minimax/minimax-m2.1-highspeed": "MiniMax M2.1, high-speed variant.",
  "minimax/minimax-m2": "MiniMax's M2 — reasoning-capable text model.",
  "deepseek/deepseek-v4-pro": "DeepSeek's flagship v4 — 1M context, strong general reasoning.",
  "deepseek/deepseek-v4-flash": "Faster DeepSeek v4 tier — same huge context, lower latency.",
  "deepseek/deepseek-v3.2": "DeepSeek V3.2 — reasoning model, 128K context.",
  "deepseek/deepseek-chat-v3.1": "DeepSeek V3.1 chat/reasoning model.",
  "stealth/ox-alpha-free": "An unbranded/\"stealth\" model available free via xKiro — capabilities unconfirmed, try it and see.",
};

/** Falls back to a capability-derived one-liner when a model has no hand-written entry above. */
export function getModelDescription(modelId: string, capabilities: readonly string[]): string {
  const known = MODEL_DOCS[modelId];
  if (known) return known;
  const parts = capabilities.filter((c) => c !== "text");
  return parts.length
    ? `General-purpose model with ${parts.join(", ")} support.`
    : "General-purpose text model.";
}
