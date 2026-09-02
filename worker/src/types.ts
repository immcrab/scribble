export interface Env {
  ALLOWED_ORIGINS: string;
  XKIRO_API_KEY?: string;
  GROQ_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  /** Z.ai (Zhipu AI) key for the GLM family — see adapters/zai.ts. */
  ZAI_API_KEY?: string;
  SCRIBBLE_PASSWORD?: string;
  /** Cloudflare account id + Workers AI token, for /api/image/generate. */
  CF_ACCOUNT_ID?: string;
  CF_AI_TOKEN?: string;
  /** SerpApi key — powers Agent Mode's web-search toggle. */
  SERP_API_KEY?: string;
}

export type Provider = "xkiro" | "mistral" | "gemini" | "openrouter" | "zai" | "custom";

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

/** Ambient info about the user's own device/environment, gathered client-side and folded
 * into the system prompt (see adapters/base.ts's buildSystemPrompt) so the model can answer
 * "what time is it", "how far away is X", etc. without the user having to state it. */
export interface ClientContext {
  /** Human-readable local date/time, formatted client-side (e.g. "Tuesday, August 25, 2026, 3:42 PM PDT"). */
  localTime?: string;
  /** IANA timezone name, e.g. "America/Los_Angeles". */
  timezone?: string;
  /** Coarse "lat, lon" coordinates, only present when the user opted in via Settings and granted
   * browser location permission — see frontend/src/lib/clientContext.ts. */
  location?: string;
  /** User-authored instructions from Settings, appended to the base system prompt — see
   * adapters/base.ts's buildSystemPrompt. */
  customSystemPrompt?: string;
  /** Stored memory facts the client has for this user (settings.memoryEnabled). The
   * /api/chat/stream handler decides per-turn (via adapters/memory.ts's shouldRecallMemory)
   * whether they're relevant before letting them reach buildSystemPrompt. */
  memories?: string[];
  /** English name of the language every reply should be written in (frontend settings.replyLanguage);
   * absent when the user leaves it on "auto". Folded into the system prompt by buildSystemPrompt. */
  replyLanguage?: string;
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
  /** The client's "memory" setting. When true, the Worker asks a fast Groq classifier
   * whether the latest user message contains something worth remembering, and if so,
   * reports it back as a "Memory" tool call — see adapters/memory.ts. */
  memoryEnabled?: boolean;
  /** Local date/time, timezone, (opt-in) approximate location, custom instructions, and
   * stored memory facts — see ClientContext. */
  clientContext?: ClientContext;
}

export interface AdapterParams {
  apiKey: string;
  model: string;
  messages: WireMessage[];
  visionCapable: boolean;
  effort?: Effort;
  clientContext?: ClientContext;
}

export type ProviderAdapter = (params: AdapterParams) => Promise<ReadableStream<Uint8Array>>;
