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
  // Mistral (the configured Studio free tier; Labs entries are free experimental models)
  "mistral-large-4-0": "Mistral Large 4 is Mistral's current open-weight, multimodal generalist model with a 512K-token context window.",
  "zai-glm-5-3": "Z.ai GLM 5.3 is a third-party open-weight text reasoning model available through Mistral's platform with a 1M-token context window.",
  "mistral-large-latest": "Mistral's flagship legacy alias — multimodal with a 262K-token context window when available to the connected Studio account.",
  "mistral-medium-latest": "Mistral Medium 3.5 — frontier-class multimodal model at mid-tier cost, tuned for agentic and coding work.",
  "mistral-small-latest": "Mistral Small 4 — the compact hybrid model that unifies instruct, reasoning, and coding; fast and cheap for everyday tasks, still reads images.",
  "ministral-14b-latest": "Ministral 3 14B — Mistral's capable, efficient multimodal model for general and coding work.",
  "ministral-8b-latest": "Ministral 3 8B — compact, multimodal, and suited to lower-latency everyday tasks.",
  "ministral-3b-latest": "Ministral 3 3B — Mistral's smallest current chat model, optimized for low latency and image understanding.",
  "codestral-latest": "Mistral's dedicated coding model (25.08) — trained specifically for code generation and completion, 256K context.",
  "mistral-code-latest": "Mistral's current code model for repository work, code generation, and completion.",
  "mistral-code-fim-latest": "Mistral Code with fill-in-the-middle support, useful for precise edits and code completion.",
  "labs-leanstral-1-5-1": "Leanstral 1.5.1 is Mistral's free Labs model for Lean formal proof engineering; Labs models can change without notice.",
  "magistral-medium-latest": "Magistral Medium is Mistral's reasoning-focused multimodal model for complex analysis.",
  "magistral-small-latest": "Magistral Small is the faster compact option in Mistral's reasoning model family.",
  "mistral-vibe-cli-latest": "Mistral Vibe CLI is a tool-aware coding and agentic chat model exposed by Mistral Studio.",
  "mistral-vibe-cli-with-tools": "Mistral Vibe CLI Tools is the tool-enabled Vibe deployment for coding and agent workflows.",
  "mistral-vibe-cli-fast": "Mistral Vibe CLI Fast prioritizes lower-latency coding and agentic chat.",
  "voxtral-small-latest": "Voxtral Small is Mistral's compact conversational audio family model; Lofin currently uses its chat capability for text prompts.",

  // Gemini (free API tier — 3.x Flash and Flash-Lite only)
  "gemini-3.7-flash": "Google's latest Flash tier — 1M-token context, tuned for complex coding and agentic workflows, reads text, images, and code.",
  "gemini-3.6-flash": "Google's previous-generation Flash — huge 1M-token context, handles text, images, and code.",
  "gemini-3.5-flash": "Legacy Flash model for high-throughput tasks — 1M context, still multimodal.",
  "gemini-3.5-flash-lite": "Lighter/faster Gemini — trades some capability for speed and cost, still reads images.",
  "gemini-3.1-flash-lite": "Frontier-class performance at reduced cost — the budget Flash-Lite option, 1M context, reads images.",

  // Groq (developer-plan models; pricing is managed by Groq, not Lofin)
  "openai/gpt-oss-120b": "GPT-OSS 120B on Groq — a large, fast reasoning and coding model with a 131K-token context window.",
  "openai/gpt-oss-20b": "GPT-OSS 20B on Groq — a smaller, very fast reasoning and coding model with a 131K-token context window.",
  "qwen/qwen3.8-27b": "Qwen 3.8 27B on Groq — a fast multimodal model that handles image understanding, coding, and reasoning.",

  // OpenRouter (every model OpenRouter's catalog currently lists as free)
  "thinkingmachines/inkling:free": "Thinking Machines' Inkling via OpenRouter — multimodal reasoning model with a ~1M-token context window.",
  "thinkingmachines/inkling-small:free": "The smaller Inkling — multimodal reasoning, ~1M context, lighter and faster than full Inkling.",
  "nvidia/nemotron-3-ultra-550b-a55b:free": "NVIDIA's largest Nemotron — huge 1M context for long-document reasoning.",
  "google/gemma-4-31b-it:free": "Google's open Gemma 4, instruction-tuned — reads text and images, 262K context.",
  "google/gemma-4-26b-a4b-it:free": "Gemma 4 26B A4B — a smaller mixture-of-experts Gemma 4, still multimodal.",
  "nvidia/nemotron-3.5-lightning:free": "NVIDIA's speed-tuned Nemotron — 1M context, reasoning-capable, optimized for low latency.",
  "cohere/north-mini-code:free": "Cohere's North Mini Code — compact model tuned for code and tool use, 256K context.",
  "liquid/lfm-2.5-2.6b:free": "LiquidAI's LFM2.5 2.6B — a very small, fast text model for lightweight tasks.",
  "dots-studio/dots-3-note-preview:free": "Dots Studio's Dots3-Note preview — multimodal model with a 512K context window.",
  "poolside/laguna-s-2.1:free": "Poolside's Laguna model — 262K context geared toward code-heavy work.",
  "poolside/laguna-xs-2.1:free": "Laguna XS 2.1 — the extra-small Laguna, same 262K context, tuned for lighter code tasks.",
  "nvidia/nemotron-3-super-120b-a12b:free": "Mid-size NVIDIA Nemotron — 262K context, reasoning-capable general model.",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": "Small NVIDIA omni-modal Nemotron with an explicit reasoning mode — reads images, 256K context.",
  "openrouter/free": "OpenRouter's own router — picks a free upstream model for each request, so quality varies but you never hit a paywall.",

  // Z.ai (Zhipu AI's GLM family, first-party API — free "Flash" tier only)
  "glm-4.7-flash": "Z.ai's GLM-4.7 Flash — the free, lightweight GLM-4.7: a ~30B mixture-of-experts model tuned for coding and reasoning, ~200K context.",
  "glm-4.6v-flash": "GLM-4.6V Flash — Z.ai's free vision model, with native function calling for multimodal agents, ~128K context.",
  "glm-4.5-flash": "GLM-4.5 Flash — the previous free GLM Flash, a solid general-purpose text and reasoning model at ~128K context.",

  // xKiro
  "qwen/qwen3.8-omni-flash:free": "Qwen's current fast multimodal model via xKiro — free, reasoning-capable, vision-enabled, and built for a 1M-token context window.",
  "qwen/qwen3.8-max:free": "Qwen's largest current model via xKiro — top-tier reasoning and vision at 1M context.",
  "qwen/qwen3.7-max:free": "Qwen 3.7 Max — large-context reasoning model, no vision.",
  "qwen/qwen3.7-plus:free": "Qwen 3.7 Plus — strong reasoning and vision at 1M context.",
  "qwen/qwen3.7-flash:free": "Qwen 3.7 Flash — fast, vision-capable reasoning at a 1M-token context window.",
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
  "mistralai/mistral-small-2603": "Mistral Small 4 via xKiro — a balanced text, reasoning, and vision model.",
  "mistralai/ministral-14b": "Mid-size Mistral model — vision-capable, no reasoning mode.",
  "mistralai/ministral-8b": "Compact Mistral model for simple, fast tasks — vision-capable.",
  "mistralai/ministral-3b": "Smallest Mistral available here — lowest latency, lightest tasks only.",
  "mistralai/codestral-2508": "Mistral's Codestral, latest revision — code-focused generation.",
  "mistralai/devstral-medium": "Mistral's Devstral — agentic, multi-step coding workflows.",
  "inclusionai/ling-3.0-flash-sante:free": "InclusionAI's Ling 3.0 Flash Sante — a free health and medicine-focused reasoning model with 262K context.",
  "meta/muse-spark-1.3-contributor:free": "Meta's Muse Spark 1.3 — free multimodal reasoning and agent model with tool calling and a 1M-token context window.",
  "sensenova/sensenova-6.8-flash-lite": "SenseNova 6.8 Flash-Lite — lightweight multimodal model for everyday agent workflows, with a 262K-token context window.",
  "sensenova/sensenova-6.7-flash-lite": "SenseNova 6.7 Flash-Lite — lightweight multimodal model for text and image understanding, with a 262K-token context window.",
  "cohere/command-a-plus": "Cohere's flagship Command A+ — native reasoning, tool calling, and image understanding for enterprise agentic workflows, with a 436K context window.",
  "cohere/north-mini-code": "Cohere's North Mini Code — a 30B sparse mixture-of-experts model (3B active) focused on agentic coding, 256K context.",
  "cohere/command-a-reasoning": "Cohere's Command A Reasoning — a reasoning-first model for agentic workflows and tool use, with 288K context.",
  "cohere/command-a-vision": "Cohere's Command A Vision — image-capable model for charts, diagrams, OCR, and document Q&A, with 128K context.",
  "cohere/command-a": "Cohere's open-weights 111B Command A — a general, multilingual model for agentic and coding work, with 288K context.",
  "cohere/command-a-translate": "Cohere's Command A Translate — machine translation optimized for 23 languages, with an 8K context window.",
  "cohere/north-small-translate": "Cohere's North Small Translate — a 218B-total, 25B-active mixture-of-experts translation model covering 50+ languages, 32K context.",
  "cohere/command-r-plus-08-2024": "Cohere's August 2024 Command R+ revision — higher-throughput, lower-latency general model with 128K context.",
  "cohere/command-r-08-2024": "Cohere's August 2024 Command R revision — improved multilingual RAG and tool-use model with 128K context.",
  "cohere/command-r7b-12-2024": "Cohere's December 2024 Command R7B — compact, fast Command R family model with a 132K context window.",
  "cohere/aya-expanse-32b": "Cohere's Aya Expanse 32B — multilingual model serving 23 languages, with 128K context.",
  "cohere/aya-vision-32b": "Cohere's Aya Vision 32B — multimodal language and image understanding across 23 languages, with 16K context.",
  "cohere/tiny-aya-global": "Cohere's Tiny Aya Global — a 3.35B instruction-tuned multilingual model supporting 70 languages, with 8K context.",
  "cohere/tiny-aya-earth": "Cohere's Tiny Aya Earth — a 3.35B multilingual model specialized for West Asian and African languages, with 8K context.",
  "cohere/tiny-aya-fire": "Cohere's Tiny Aya Fire — a 3.35B multilingual model specialized for South Asian languages, with 8K context.",
  "cohere/tiny-aya-water": "Cohere's Tiny Aya Water — a 3.35B multilingual model specialized for European and Asia-Pacific languages, with 8K context.",
  "mistralai/mistral-large-4-0": "Mistral Large 4 via xKiro — multimodal flagship with reasoning, tool calling and a 512K context window.",
  "meta/muse-spark-1.2-contributor:free": "Meta's Muse Spark 1.2 — free multimodal reasoning and agent model with a 1M-token context window.",
  "meituan/longcat-2.0": "Meituan's LongCat 2.0 — text reasoning model with tool calling and a 1M-token context window.",
  "meituan/longcat-2.5-preview:free": "Meituan's LongCat 2.5 preview — free reasoning model with a 1M-token context window.",
  "stealth/space-bunny-alpha:free": "An unbranded \"stealth\" preview — free multimodal reasoning model with a 1M-token context window.",
  "stealth/big-pickle": "An unbranded \"stealth\" model — reasoning and tool calling with a 200K context window, free on xKiro.",
  "apodex/apodex-1.1-mini:free": "Apodex 1.1 Mini — compact free reasoning model with tool calling and 262K context.",
  "inclusionai/ling-3.1-flash": "InclusionAI's Ling 3.1 Flash via OpenRouter — fast reasoning model with 262K context.",
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
