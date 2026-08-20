import { WorkerClientError } from "./workerClient";

/** POSTs a text prompt to the Worker's Cloudflare Workers AI proxy and returns a data:
 * URL for the generated image — same error/URL conventions as workerClient.ts's streamChat. */
export async function generateImage({
  workerUrl,
  password,
  prompt,
  signal,
}: {
  workerUrl: string;
  password?: string;
  prompt: string;
  signal?: AbortSignal;
}): Promise<string> {
  if (!workerUrl) {
    throw new WorkerClientError("No Worker URL configured. Open Settings and paste your Cloudflare Worker URL.");
  }

  const res = await fetch(`${workerUrl.replace(/\/$/, "")}/api/image/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(password ? { "X-Scribble-Password": password } : {}),
    },
    body: JSON.stringify({ prompt }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new WorkerClientError((body as { error?: string } | null)?.error || `Image generation failed (${res.status})`);
  }

  const json = (await res.json()) as { dataUrl?: string };
  if (!json.dataUrl) {
    throw new WorkerClientError("Worker response had no image.");
  }
  return json.dataUrl;
}
