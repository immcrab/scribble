import { useId } from "react";
import { Plug } from "lucide-react";
import type { ModelDef, Provider } from "../types";

export function GeminiIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  const gradId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`shrink-0 ${className}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4E82EE" />
          <stop offset="45%" stopColor="#9B72CB" />
          <stop offset="85%" stopColor="#D96570" />
          <stop offset="100%" stopColor="#F49C46" />
        </linearGradient>
      </defs>
      <path
        d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z"
        fill={`url(#${gradId})`}
      />
    </svg>
  );
}

export function MistralIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`shrink-0 ${className}`} xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="3" width="3.6" height="3.6" fill="#FF7000" rx="0.5" />
      <rect x="18.4" y="3" width="3.6" height="3.6" fill="#FF7000" rx="0.5" />
      <rect x="2" y="7" width="3.6" height="3.6" fill="#FF5C00" rx="0.5" />
      <rect x="6.1" y="7" width="3.6" height="3.6" fill="#FF5C00" rx="0.5" />
      <rect x="14.3" y="7" width="3.6" height="3.6" fill="#FF5C00" rx="0.5" />
      <rect x="18.4" y="7" width="3.6" height="3.6" fill="#FF5C00" rx="0.5" />
      <rect x="2" y="11" width="3.6" height="3.6" fill="#FF4500" rx="0.5" />
      <rect x="10.2" y="11" width="3.6" height="3.6" fill="#FF4500" rx="0.5" />
      <rect x="18.4" y="11" width="3.6" height="3.6" fill="#FF4500" rx="0.5" />
      <rect x="2" y="15" width="3.6" height="3.6" fill="#E63300" rx="0.5" />
      <rect x="18.4" y="15" width="3.6" height="3.6" fill="#E63300" rx="0.5" />
      <rect x="2" y="19" width="3.6" height="3.6" fill="#CC2400" rx="0.5" />
      <rect x="18.4" y="19" width="3.6" height="3.6" fill="#CC2400" rx="0.5" />
    </svg>
  );
}

export function GroqIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`shrink-0 ${className}`} xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5" fill="#F55036" fillOpacity="0.16" />
      <path
        d="M17.5 12C17.5 8.96 15.04 6.5 12 6.5C8.96 6.5 6.5 8.96 6.5 12C6.5 15.04 8.96 17.5 12 17.5C14.62 17.5 16.8 15.67 17.36 13.2H12V10.8H19.75C19.91 11.19 20 11.59 20 12C20 16.42 16.42 20 12 20C7.58 20 4 16.42 4 12C4 7.58 7.58 4 12 4C15.82 4 19.01 6.68 19.8 10.25"
        stroke="#F55036"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#10A37F" className={`shrink-0 ${className}`} xmlns="http://www.w3.org/2000/svg">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.5045 4.5045 0 0 1-4.4945 4.4947zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1683a.0757.0757 0 0 1-.071 0l-4.8303-2.7866A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.6669zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1635a.0804.0804 0 0 1-.038-.0567V6.0748a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.4598a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  );
}

export function QwenIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`shrink-0 ${className}`} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2L20.66 7V17L12 22L3.34 17V7L12 2Z"
        fill="#615CED"
        fillOpacity="0.18"
        stroke="#615CED"
        strokeWidth="1.8"
      />
      <path
        d="M12 6.5L16.8 9.5V14.5L12 17.5L7.2 14.5V9.5L12 6.5Z"
        fill="#615CED"
      />
    </svg>
  );
}

export function XiaomiIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`shrink-0 ${className}`} xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5" fill="#FF6900" />
      <path
        d="M7 16V8H9.8L12 11.8L14.2 8H17V16H14.6V11.2L12.7 14.6H11.3L9.4 11.2V16H7Z"
        fill="white"
      />
    </svg>
  );
}

export function MiniMaxIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`shrink-0 ${className}`} xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5" fill="#2563EB" fillOpacity="0.16" />
      <path
        d="M5 14V10M8.5 17V7M12 19V5M15.5 17V7M19 14V10"
        stroke="#3B82F6"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function ProviderFavicon({
  provider,
  size = 16,
  className = "",
}: {
  provider: Provider;
  size?: number;
  className?: string;
}) {
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
  const activeProvider = model?.provider ?? provider;
  const activeModelId = model?.modelId ?? modelId ?? "";

  // Specific model family icons
  if (activeModelId.startsWith("openai/")) {
    return <OpenAIIcon size={size} className={className} />;
  }
  if (activeModelId.startsWith("qwen/")) {
    return <QwenIcon size={size} className={className} />;
  }
  if (activeModelId.startsWith("xiaomi/")) {
    return <XiaomiIcon size={size} className={className} />;
  }
  if (activeModelId.startsWith("minimax/")) {
    return <MiniMaxIcon size={size} className={className} />;
  }
  if (activeModelId.startsWith("mistralai/") || activeModelId.includes("mistral") || activeModelId.includes("codestral") || activeModelId.includes("devstral")) {
    return <MistralIcon size={size} className={className} />;
  }
  if (activeModelId.startsWith("gemini-")) {
    return <GeminiIcon size={size} className={className} />;
  }

  // Fallback to provider favicon
  if (activeProvider) {
    return <ProviderFavicon provider={activeProvider} size={size} className={className} />;
  }

  return <XKiroIcon size={size} className={className} />;
}
