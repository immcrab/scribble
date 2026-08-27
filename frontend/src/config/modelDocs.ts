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
  // Mistral (La Plateforme free "Experiment" tier — every chat model is free)
  "mistral-large-latest": "Mistral's flagship — Mistral Large 3, a multimodal model with the strongest reasoning and code in their lineup and a 262K context window.",
  "mistral-medium-latest": "Mistral Medium 3.5 — frontier-class multimodal model at mid-tier cost, tuned for agentic and coding work.",
  "mistral-small-latest": "Mistral Small 4 — the compact hybrid model that unifies instruct, reasoning, and coding; fast and cheap for everyday tasks, still reads images.",
  "ministral-3-14b-latest": "Ministral 3 14B — best-in-class efficiency for its size, multimodal, handles code.",
  "ministral-3-8b-latest": "Ministral 3 8B — powerful and efficient, multimodal, good for low-latency general use.",
  "ministral-3-3b-latest": "Ministral 3 3B — Mistral's tiny model, lowest latency, still reads images.",
  "codestral-latest": "Mistral's dedicated coding model (25.08) — trained specifically for code generation and completion, 256K context.",

  // Gemini (free API tier — 3.x Flash and Flash-Lite only)
  "gemini-3.7-flash": "Google's latest Flash tier — 1M-token context, tuned for complex coding and agentic workflows, reads text, images, and code.",
  "gemini-3.6-flash": "Google's previous-generation Flash — huge 1M-token context, handles text, images, and code.",
  "gemini-3.5-flash": "Legacy Flash model for high-throughput tasks — 1M context, still multimodal.",
  "gemini-3.5-flash-lite": "Lighter/faster Gemini — trades some capability for speed and cost, still reads images.",
  "gemini-3.1-flash-lite": "Frontier-class performance at reduced cost — the budget Flash-Lite option, 1M context, reads images.",

  // OpenRouter (every model OpenRouter's catalog currently lists as free)
  "z-ai/glm-5.2:free": "Zhipu's GLM 5.2 via OpenRouter — strong general and code model with a 256K context window.",
  "minimax/minimax-m3:free": "MiniMax M3 — natively multimodal, 1M context, reasoning-capable.",
  "thinkingmachines/inkling:free": "Thinking Machines' Inkling via OpenRouter — multimodal reasoning model with a ~1M-token context window.",
  "thinkingmachines/inkling-small:free": "The smaller Inkling — multimodal reasoning, ~1M context, lighter and faster than full Inkling.",
  "minimax/minimax-m2.7:free": "MiniMax M2.7 — reasoning model built for autonomous, agentic productivity tasks.",
  "nvidia/nemotron-3-ultra-550b-a55b:free": "NVIDIA's largest Nemotron — huge 1M context for long-document reasoning.",
  "google/gemma-4-31b-it:free": "Google's open Gemma 4, instruction-tuned — reads text and images, 262K context.",
  "google/gemma-4-26b-a4b-it:free": "Gemma 4 26B A4B — a smaller mixture-of-experts Gemma 4, still multimodal.",
  "nvidia/nemotron-3.5-lightning:free": "NVIDIA's speed-tuned Nemotron — 1M context, reasoning-capable, optimized for low latency.",
  "cohere/north-mini-code:free": "Cohere's North Mini Code — compact model tuned for code and tool use, 256K context.",
  "liquid/lfm-2.5-2.6b:free": "LiquidAI's LFM2.5 2.6B — a very small, fast text model for lightweight tasks.",
  "stealth/ox-alpha": "An unbranded \"stealth\" model routed free through OpenRouter — multimodal, 1M context, capabilities unconfirmed.",
  "dots-studio/dots-3-note-preview:free": "Dots Studio's Dots3-Note preview — multimodal model with a 512K context window.",
  "poolside/laguna-s-2.1:free": "Poolside's Laguna model — 262K context geared toward code-heavy work.",
  "poolside/laguna-xs-2.1:free": "Laguna XS 2.1 — the extra-small Laguna, same 262K context, tuned for lighter code tasks.",
  "nvidia/nemotron-3-super-120b-a12b:free": "Mid-size NVIDIA Nemotron — 262K context, reasoning-capable general model.",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": "Small NVIDIA omni-modal Nemotron with an explicit reasoning mode — reads images, 256K context.",
  "openrouter/free": "OpenRouter's own router — picks a free upstream model for each request, so quality varies but you never hit a paywall.",

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
