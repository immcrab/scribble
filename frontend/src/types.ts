export type Provider = "xkiro" | "groq" | "mistral" | "gemini" | "custom";

export type ModelCapability = "text" | "vision" | "code" | "reasoning";

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
  /** Added by the user via Settings rather than curated in config/*.ts — shows a delete affordance. */
  isCustom?: boolean;
  /** Only set when provider === "custom" — id of the CustomProvider (settings.customProviders) that owns this model. */
  customProviderId?: string;
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
}

export type Mode = "battle" | "agent" | "side-by-side" | "direct";

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
}
