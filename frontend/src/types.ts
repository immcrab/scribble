export type Provider = "xkiro" | "mistral" | "gemini" | "openrouter" | "puter" | "custom";

/** Claude-Code-style reasoning depth, sent to the Worker and mapped to a
 * per-provider native param (or a system-prompt nudge) — see worker/src/adapters. */
export type Effort = "low" | "medium" | "high" | "extra" | "ultra";

export type ModelCapability = "text" | "vision" | "video" | "code" | "reasoning";

export interface ModelDef {
  provider: Provider;
  modelId: string;
  displayName: string;
  /** lucide-react icon name, resolved in ModelSelector */
  icon: string;
  contextLength: number;
  capabilities: ModelCapability[];
  free: boolean;
  supportsStreaming: boolean;
  supportsVision: boolean;
  description?: string;
  /** Set when this model is confirmed to be failing upstream (e.g. an outage on the
   * provider's end). Still fully selectable — this only drives a warning badge in the
   * selector — clear it once the model is re-verified working. */
  knownBroken?: string;
  /** Added by the user via Settings rather than curated in config/*.ts — shows a delete affordance. */
  isCustom?: boolean;
  /** Only set when provider === "custom" — id of the CustomProvider (settings.customProviders) that owns this model. */
  customProviderId?: string;
  /** User-supplied image URL, shown instead of any built-in icon when set (ModelFavicon checks this first). */
  logoUrl?: string;
}

/**
 * The shared, admin-curated overlay on the built-in model catalog, edited only from the
 * `/admin` page (see pages/AdminPage.tsx) and synced to every visitor via RTDB
 * `catalog/v1` (see lib/catalogSync.ts). Unlike `customModels`, which are per-browser,
 * everything here is global — one admin adds an "official" model and everyone sees it.
 */
export interface AdminCatalog {
  /** Extra models the admin published — merged into the catalog for all users, not flagged `isCustom`. */
  added: ModelDef[];
  /** `"{provider}:{modelId}"` keys filtered out of the catalog for all users — lets the admin
   * remove a built-in (or previously-added) model. The default model can never be hidden. */
  hiddenKeys: string[];
  /** Daily usage-limit configuration, edited from `/admin` → Limits. Optional so a catalog
   * blob published before this feature existed still parses (defaults fill in — see
   * lib/catalogSync.ts's `DEFAULT_USAGE`). */
  usage?: UsageConfig;
  /** Date.now() of the last admin edit — last-write-wins if two admin tabs race. */
  updatedAt: number;
}

/**
 * Admin-controlled knobs for the per-user daily credit limit (see lib/usage.ts). Lives inside
 * `AdminCatalog` so it rides the same world-readable, admin-writable `catalog/v1` RTDB node —
 * no extra security rule. 1 credit ≈ 1 token (prompt + reply, estimated).
 */
export interface UsageConfig {
  /** Credits every signed-in user gets per UTC day. Default 1,000,000. */
  dailyCredits: number;
  /** `"{provider}:{modelId}"` keys still usable after a user burns through their daily credits.
   * The free default model is always usable regardless and needn't be listed. */
  postLimitKeys: string[];
  /** `"{provider}:{modelId}"` → credit cost multiplier (default 1). 2 = burns credits twice as
   * fast, 0.5 = half, 0 = free / never counted. */
  modelCredits: Record<string, number>;
  /** Firebase uids blocked from every model except the free default. */
  blockedUids: string[];
  /** uid → extra credits granted for one specific UTC day (`{ day: "YYYY-MM-DD", credits }`).
   * Ignored once the day rolls over. */
  bonus: Record<string, { day: string; credits: number }>;
}

/**
 * One signed-in user's usage for the current UTC day, at RTDB `usage/{uid}`. Written by that
 * user (client-side, after each completed reply — see lib/usage.ts), readable by that user and
 * the admin. Resets implicitly: once `day` no longer matches today, the counts are treated as 0.
 */
export interface UsageRecord {
  /** "YYYY-MM-DD" (UTC) the counts below belong to. */
  day: string;
  /** Total credits consumed today. */
  credits: number;
  /** modelSlug → credits consumed today, for the "most used model" breakdown. */
  models: Record<string, number>;
  /** Denormalized so the admin Users tab can show who's who without a second lookup. */
  email: string | null;
  updatedAt: number;
}

/** A user-defined OpenAI-compatible endpoint (name + base URL + API key), configured in Settings.
 * The API key travels with each chat request to the Worker, which forwards it straight through —
 * unlike the built-in providers, it's never stored server-side. */
export interface CustomProvider {
  id: string;
  name: string;
  /** OpenAI-compatible API root, e.g. "https://api.example.com/v1" — the Worker appends "/chat/completions". */
  baseUrl: string;
  apiKey: string;
  /** User-supplied image URL, shown for this provider instead of the generic plug icon. */
  logoUrl?: string;
}

/** Ambient info about the user's own device/environment, gathered client-side and sent with
 * each chat request so the model can answer time/location-relative questions without the user
 * having to state them — see lib/clientContext.ts. Mirrors worker/src/types.ts's ClientContext. */
export interface ClientContext {
  localTime?: string;
  timezone?: string;
  location?: string;
  /** User-configured custom instructions (settings.customSystemPrompt), appended to the base
   * system prompt server-side — see worker/src/adapters/base.ts's buildSystemPrompt. */
  customSystemPrompt?: string;
  /** Stored memory facts (settings.memoryEnabled), sent so the model can use them this turn —
   * the Worker decides per-turn whether they're actually relevant before including them. */
  memories?: string[];
  /** English name of the language the user wants every reply in (settings.replyLanguage),
   * omitted when "auto" — see worker/src/adapters/base.ts's buildSystemPrompt. */
  replyLanguage?: string;
}

/** A remembered fact about the user, either extracted by the AI (explicit "remember that..."
 * ask or a durable fact it decided was worth keeping) or added manually in Settings. */
export interface MemoryEntry {
  id: string;
  content: string;
  createdAt: number;
}

export type Role = "user" | "assistant" | "system" | "tool";

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  /** data URL, kept small — this is a local-first demo, not a file store */
  dataUrl: string;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  status: "pending" | "running" | "done" | "error";
  input?: Record<string, unknown>;
  output?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  model?: ModelDef;
  attachments?: Attachment[];
  toolCalls?: ToolCallRecord[];
  streaming?: boolean;
  error?: string;
  /** for battle/side-by-side: which pane this message belongs to */
  pane?: "a" | "b";
  revealed?: boolean;
  /** Reasoning/thinking text streamed separately from the answer (see runStream.ts). */
  reasoning?: string;
  /** Date.now() when this assistant turn started — drives the live "Thinking for Ns" timer. */
  thinkingStartedAt?: number;
  /** Elapsed ms from thinkingStartedAt to the first real content token — frozen once set. */
  thinkingMs?: number;
  /** Estimated token count (~4 chars/token) of reasoning + content, updated live as chunks arrive. */
  tokenCount?: number;
  /** Set when the upstream model stopped because it hit its output-token limit (finish_reason
   * "length" / Gemini "MAX_TOKENS") rather than finishing — the content above is cut off
   * mid-stream. Drives the "response was truncated" notice in ChatMessage. */
  truncated?: boolean;
}

export type Mode = "battle" | "agent" | "side-by-side" | "direct" | "image";

export interface Vote {
  winner: "a" | "b" | "tie";
  modelA: string;
  modelB: string;
}

export interface Chat {
  id: string;
  title: string;
  mode: Mode;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  modelId?: string;
  modelAId?: string;
  modelBId?: string;
  vote?: Vote;
  /** Per-chat override of settings.effort — falls back to the global default when unset. */
  effort?: Effort;
  /** id of the Project this chat belongs to (see types.ts's Project). When set, the chat
   * lives inside that project's tabbed view and is hidden from the flat History list. */
  projectId?: string;
}

/** A named group of chats. Chats inside a project run in a tabbed workspace with a
 * broadcast composer that can fan one prompt out to every chat at once — see
 * components/ProjectView.tsx. Persisted and cloud-synced exactly like chats. */
export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}
