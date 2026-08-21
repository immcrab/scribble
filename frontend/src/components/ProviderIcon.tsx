import { useId } from "react";
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
} as const;

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

export function GroqIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <LogoImage src={LOGO_URLS.groq} size={size} className={className} />;
}

/** xKiro is this app's own aggregator brand — no public logo exists, so it keeps a drawn mark. */
export function XKiroIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  const gradId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`shrink-0 ${className}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="50%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="5" fill={`url(#${gradId})`} fillOpacity="0.16" />
      <path
        d="M6 6L18 18M18 6L6 18"
        stroke={`url(#${gradId})`}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.5" fill={`url(#${gradId})`} />
      <circle cx="6" cy="6" r="1.3" fill="#C084FC" />
      <circle cx="18" cy="18" r="1.3" fill="#22D3EE" />
      <circle cx="18" cy="6" r="1.3" fill="#818CF8" />
      <circle cx="6" cy="18" r="1.3" fill="#818CF8" />
    </svg>
  );
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
    case "groq":
      return <GroqIcon size={size} className={className} />;
    case "xkiro":
      return <XKiroIcon size={size} className={className} />;
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
  if (idLower.startsWith("mistralai/") || idLower.includes("mistral") || idLower.includes("codestral") || idLower.includes("devstral")) {
    return <MistralIcon size={size} className={className} />;
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
