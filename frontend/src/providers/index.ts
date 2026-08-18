/**
 * Frontend-side provider abstraction. The UI never branches on `provider` —
 * every mode calls this single function with a ModelDef and gets a uniform
 * token stream back. The actual per-provider request shaping (xKiro/Groq/
 * Mistral/Gemini) lives server-side in worker/src/adapters, since that's
 * where the real API differences (auth headers, payload shape, SSE format)
 * live. This keeps the browser bundle provider-agnostic and API keys never
 * touch client code.
 */
export { streamChat, checkWorkerHealth, WorkerClientError } from "../lib/workerClient";
export type { WireMessage } from "../lib/workerClient";
