export interface Env {
  ALLOWED_ORIGINS: string;
  XKIRO_API_KEY?: string;
  GROQ_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  SCRIBBLE_PASSWORD?: string;
  /** Cloudflare account id + Workers AI token, for /api/image/generate. */
  CF_ACCOUNT_ID?: string;
  CF_AI_TOKEN?: string;
  /** SerpApi key — powers Agent Mode's web-search toggle. */
  SERP_API_KEY?: string;
}

export type Provider = "xkiro" | "mistral" | "gemini" | "openrouter" | "custom";

/** Claude-Code-style reasoning depth. Gemini maps it to a native
 * thinkingBudget param; providers without one (xKiro, Mistral,
 * custom) get a system-prompt depth nudge instead — see adapters/base.ts. */
export type Effort = "low" | "medium" | "high" | "extra" | "ultra";

export interface WireAttachment {
  name?: string;
  type?: string;
  dataUrl: string;
}

export interface WireMessage {
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: WireAttachment[];
}

/** A user-defined OpenAI-compatible endpoint, sent by the client with each request when
 * `provider === "custom"` — unlike the built-in providers, this key is never stored as a
 * Worker secret; it travels with the request and is forwarded straight through. */
export interface CustomProviderConfig {
  baseUrl: string;
  apiKey: string;
}

export interface ChatRequestBody {
  provider: Provider;
  model: string;
  messages: WireMessage[];
  /** Whether the selected model declares vision support — gates whether image attachments are sent as image parts. */
  visionCapable?: boolean;
  /** Required when provider === "custom". */
  customProvider?: CustomProviderConfig;
  effort?: Effort;
  /** The client's "auto web search" setting. When true, the Worker first asks a fast
   * Groq classifier whether the latest user message actually needs a live search, and
   * only then runs the SerpApi lookup — see the /api/chat/stream handler. */
  webSearch?: boolean;
}

export interface AdapterParams {
  apiKey: string;
  model: string;
  messages: WireMessage[];
  visionCapable: boolean;
  effort?: Effort;
}

export type ProviderAdapter = (params: AdapterParams) => Promise<ReadableStream<Uint8Array>>;
