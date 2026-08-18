export interface Env {
  ALLOWED_ORIGINS: string;
  XKIRO_API_KEY?: string;
  GROQ_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  GEMINI_API_KEY?: string;
  SCRIBBLE_PASSWORD?: string;
}

export type Provider = "xkiro" | "groq" | "mistral" | "gemini";

export interface WireMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequestBody {
  provider: Provider;
  model: string;
  messages: WireMessage[];
}

export interface AdapterParams {
  apiKey: string;
  model: string;
  messages: WireMessage[];
}

export type ProviderAdapter = (params: AdapterParams) => Promise<ReadableStream<Uint8Array>>;
