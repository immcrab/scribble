export type Provider = "xkiro" | "groq" | "mistral" | "gemini";

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
