import { Plug } from "lucide-react";
import type { ModelDef, Provider } from "../types";

const LOBEHUB = "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/dark";

/** Real brand logos — lobehub's icon set for anything without a specific CDN source of its own. */
const LOGO_URLS = {
  gemini: `${LOBEHUB}/gemini-color.png`,
  mistral: `${LOBEHUB}/mistral-color.png`,
  groq: `${LOBEHUB}/groq.png`,
  openai: `${LOBEHUB}/openai.png`,
  anthropic: `${LOBEHUB}/claude-color.png`,
  deepseek: "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/dark/deepseek-color.png",
  meta: `${LOBEHUB}/meta-color.png`,
  grok: `${LOBEHUB}/grok.png`,
  cohere: `${LOBEHUB}/cohere-color.png`,
  perplexity: `${LOBEHUB}/perplexity-color.png`,
  microsoft: `${LOBEHUB}/microsoft-color.png`,
  amazon: `${LOBEHUB}/nova-color.png`,
  nvidia: `${LOBEHUB}/nvidia-color.png`,
  together: `${LOBEHUB}/together-color.png`,
  openrouter: `${LOBEHUB}/openrouter-color.png`,
  qwen: "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/dark/qwen-color.png",
  mimo: "https://cdn.xtrouter.com/tag-images/0fe99040-c983-4e95-a208-d5ef6072cf83.png",
  minimax: "https://cdn.xtrouter.com/tag-images/minimax-logo.png",
  xkiro: "https://xkiro.com/images/logo/logo-xt-green.png",
  // Zhipu AI's chat models ship under the "GLM" brand (z-ai/glm-* ids) — lobehub files the logo under the company name.
  zhipu: `${LOBEHUB}/zhipu-color.png`,
  poolside: `${LOBEHUB}/poolside-color.png`,
  // Google's Gemma (open-weight) has its own mark, distinct from the Gemini logo above.
  gemma: `${LOBEHUB}/gemma-color.png`,
  // No lobehub entry for Puter — pulled straight from Puter's own CDN, same as xkiro above.
  puter: "https://puter.com/logo.png",
} as const;

/** Guesses a known brand's logo for a user-added custom provider from its name/base URL — falls back to the generic plug icon when nothing matches. */
export function detectCustomProviderLogo(name: string, baseUrl: string): string | undefined {
  const hay = `${name} ${baseUrl}`.toLowerCase();
  if (hay.includes("openrouter")) return LOGO_URLS.openrouter;
  if (hay.includes("together")) return LOGO_URLS.together;
  if (hay.includes("groq")) return LOGO_URLS.groq;
  if (hay.includes("perplexity")) return LOGO_URLS.perplexity;
  if (hay.includes("mistral")) return LOGO_URLS.mistral;
  if (hay.includes("cohere")) return LOGO_URLS.cohere;
  if (hay.includes("deepseek")) return LOGO_URLS.deepseek;
  if (hay.includes("anthropic") || hay.includes("claude")) return LOGO_URLS.anthropic;
  if (hay.includes("openai")) return LOGO_URLS.openai;
  if (hay.includes("gemini") || hay.includes("generativelanguage") || hay.includes("googleapis")) return LOGO_URLS.gemini;
  if (hay.includes("nvidia")) return LOGO_URLS.nvidia;
  if (hay.includes("azure") || hay.includes("microsoft")) return LOGO_URLS.microsoft;
  if (hay.includes("bedrock") || hay.includes("amazon") || hay.includes("aws")) return LOGO_URLS.amazon;
  if (hay.includes("x.ai") || hay.includes("xai") || hay.includes("grok")) return LOGO_URLS.grok;
  if (hay.includes("meta") || hay.includes("llama")) return LOGO_URLS.meta;
  if (hay.includes("dashscope") || hay.includes("alibaba") || hay.includes("qwen")) return LOGO_URLS.qwen;
  if (hay.includes("minimax")) return LOGO_URLS.minimax;
  if (hay.includes("xkiro")) return LOGO_URLS.xkiro;
  return undefined;
}

/** Renders a logo image (built-in brand or a user-supplied `logoUrl`). */
export function LogoImage({ src, size = 16, className = "" }: { src: string; size?: number; className?: string }) {
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      className={`shrink-0 rounded-sm object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function GeminiIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.gemini} size={size} className={className} />;
}

export function MistralIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.mistral} size={size} className={className} />;
}

export function XKiroIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.xkiro} size={size} className={className} />;
}

export function OpenAIIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.openai} size={size} className={className} />;
}

export function AnthropicIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.anthropic} size={size} className={className} />;
}

export function DeepSeekIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.deepseek} size={size} className={className} />;
}

export function MetaIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.meta} size={size} className={className} />;
}

export function GrokIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.grok} size={size} className={className} />;
}

export function CohereIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.cohere} size={size} className={className} />;
}

export function PerplexityIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.perplexity} size={size} className={className} />;
}

export function MicrosoftIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.microsoft} size={size} className={className} />;
}

export function AmazonIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.amazon} size={size} className={className} />;
}

export function NvidiaIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.nvidia} size={size} className={className} />;
}

export function TogetherIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.together} size={size} className={className} />;
}

export function OpenRouterIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.openrouter} size={size} className={className} />;
}

export function QwenIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.qwen} size={size} className={className} />;
}

/** Xiaomi's model family ships as "MiMo" — use MiMo's own mark rather than the Xiaomi corporate logo. */
export function XiaomiIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.mimo} size={size} className={className} />;
}

export function MiniMaxIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.minimax} size={size} className={className} />;
}

/** Zhipu AI is the company behind the GLM model family. */
export function GlmIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.zhipu} size={size} className={className} />;
}

export function PoolsideIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.poolside} size={size} className={className} />;
}

export function GemmaIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.gemma} size={size} className={className} />;
}

export function PuterIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.puter} size={size} className={className} />;
}

export function ProviderFavicon({
  provider,
  logoUrl,
  size = 16,
  className = "",
}: {
  provider: Provider;
  /** Custom-provider override — when set, renders this image instead of the built-in icon. */
  logoUrl?: string;
  size?: number;
  className?: string;
}) {
  if (logoUrl) {
    return <LogoImage src={logoUrl} size={size} className={className} />;
  }
  switch (provider) {
    case "gemini":
      return <GeminiIcon size={size} className={className} />;
    case "mistral":
      return <MistralIcon size={size} className={className} />;
    case "xkiro":
      return <XKiroIcon size={size} className={className} />;
    case "openrouter":
      return <OpenRouterIcon size={size} className={className} />;
    case "puter":
      return <PuterIcon size={size} className={className} />;
    case "custom":
      return <Plug size={size} className={`shrink-0 text-slate-400 ${className}`} />;
    default:
      return <XKiroIcon size={size} className={className} />;
  }
}

export function ModelFavicon({
  model,
  provider,
  modelId,
  size = 16,
  className = "",
}: {
  model?: ModelDef;
  provider?: Provider;
  modelId?: string;
  size?: number;
  className?: string;
}) {
  if (model?.logoUrl) {
    return <LogoImage src={model.logoUrl} size={size} className={className} />;
  }

  const activeProvider = model?.provider ?? provider;
  const activeModelId = model?.modelId ?? modelId ?? "";
  const idLower = activeModelId.toLowerCase();

  // Specific model family icons
  if (idLower.startsWith("openai/") || idLower.startsWith("gpt-") || idLower.includes("gpt-")) {
    return <OpenAIIcon size={size} className={className} />;
  }
  if (idLower.startsWith("anthropic/") || idLower.includes("claude")) {
    return <AnthropicIcon size={size} className={className} />;
  }
  if (idLower.includes("deepseek")) {
    return <DeepSeekIcon size={size} className={className} />;
  }
  if (idLower.startsWith("meta/") || idLower.includes("llama")) {
    return <MetaIcon size={size} className={className} />;
  }
  if (idLower.startsWith("x-ai/") || idLower.includes("grok")) {
    return <GrokIcon size={size} className={className} />;
  }
  if (idLower.startsWith("cohere/") || idLower.includes("command-")) {
    return <CohereIcon size={size} className={className} />;
  }
  if (idLower.startsWith("perplexity/") || idLower.includes("sonar")) {
    return <PerplexityIcon size={size} className={className} />;
  }
  if (idLower.startsWith("microsoft/") || idLower.includes("phi-")) {
    return <MicrosoftIcon size={size} className={className} />;
  }
  if (idLower.startsWith("amazon/") || idLower.includes("nova-")) {
    return <AmazonIcon size={size} className={className} />;
  }
  if (idLower.startsWith("nvidia/") || idLower.includes("nemotron")) {
    return <NvidiaIcon size={size} className={className} />;
  }
  if (idLower.includes("mimo")) {
    return <XiaomiIcon size={size} className={className} />;
  }
  if (idLower.startsWith("qwen/") || idLower.includes("qwen")) {
    return <QwenIcon size={size} className={className} />;
  }
  if (idLower.startsWith("xiaomi/")) {
    return <XiaomiIcon size={size} className={className} />;
  }
  if (idLower.startsWith("minimax/")) {
    return <MiniMaxIcon size={size} className={className} />;
  }
  if (idLower.startsWith("z-ai/") || idLower.startsWith("zhipu") || idLower.includes("glm-") || idLower.includes("chatglm")) {
    return <GlmIcon size={size} className={className} />;
  }
  if (idLower.startsWith("poolside/") || idLower.includes("laguna")) {
    return <PoolsideIcon size={size} className={className} />;
  }
  if (idLower.startsWith("mistralai/") || idLower.includes("mistral") || idLower.includes("codestral") || idLower.includes("devstral")) {
    return <MistralIcon size={size} className={className} />;
  }
  // Gemma is Google's separate open-weight line — check before the generic Gemini match below.
  if (idLower.startsWith("google/gemma") || idLower.includes("gemma")) {
    return <GemmaIcon size={size} className={className} />;
  }
  if (idLower.startsWith("gemini-") || idLower.includes("gemini")) {
    return <GeminiIcon size={size} className={className} />;
  }

  // Fallback to provider favicon
  if (activeProvider) {
    return <ProviderFavicon provider={activeProvider} size={size} className={className} />;
  }

  return <XKiroIcon size={size} className={className} />;
}
