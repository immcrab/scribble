/**
 * Free model ids exposed by the first-party provider keys. This Worker-side
 * allowlist is the security boundary: clients must not be able to swap a
 * catalog model for an arbitrary paid id in a hand-written request.
 *
 * Keep these in sync with frontend/src/config/models.ts.
 */
export const FREE_PROVIDER_MODEL_IDS = {
  // Cloudflare Workers AI models available on the free allocation. Models that
  // require the Workers Paid plan are intentionally excluded.
  cloudflare: new Set<string>([
    "@cf/meta/llama-3.1-8b-instruct-fp8", "@cf/meta/llama-3.2-1b-instruct", "@cf/meta/llama-3.2-3b-instruct", "@cf/meta/llama-3.2-11b-vision-instruct",
    "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", "@cf/qwen/qwen2.5-coder-32b-instruct", "@cf/qwen/qwen3-30b-a3b-fp8",
    "@cf/mistralai/mistral-small-3.1-24b-instruct", "@cf/google/gemma-4-26b-a4b-it", "@cf/openai/gpt-oss-20b",
    "@cf/ibm-granite/granite-4.0-h-micro", "@cf/zai-org/glm-4.7-flash",
  ]),
  mistral: new Set<string>([
    "mistral-large-latest",
    "mistral-medium-latest",
    "mistral-small-latest",
    "ministral-3-14b-latest",
    "ministral-3-8b-latest",
    "ministral-3-3b-latest",
    "codestral-latest",
  ]),
  gemini: new Set<string>([
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
  ]),
  // Currently active Groq developer-plan chat models. The frontend marks these
  // as paid; this allowlist only prevents arbitrary model ids being submitted.
  groq: new Set<string>(["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]),
  openrouter: new Set<string>([
    "z-ai/glm-5.2:free",
    "minimax/minimax-m3:free",
    "thinkingmachines/inkling:free",
    "thinkingmachines/inkling-small:free",
    "minimax/minimax-m2.7:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3.5-lightning:free",
    "cohere/north-mini-code:free",
    "liquid/lfm-2.5-2.6b:free",
    "stealth/ox-alpha",
    "dots-studio/dots-3-note-preview:free",
    "poolside/laguna-s-2.1:free",
    "poolside/laguna-xs-2.1:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "openrouter/free",
  ]),
  zai: new Set<string>(["glm-4.7-flash", "glm-4.6v-flash", "glm-4.5-flash"]),
} as const;
