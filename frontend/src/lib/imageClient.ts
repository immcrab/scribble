import { WorkerClientError } from "./workerClient";

/** POSTs a text prompt to the Worker's Cloudflare Workers AI proxy and returns a data:
 * URL for the generated image — same error/URL conventions as workerClient.ts's streamChat. */
export async function generateImage({
  workerUrl,
  password,
  prompt,
  provider,
  model,
  signal,
}: {
  workerUrl: string;
  password?: string;
  prompt: string;
  /** Image backend — "cloudflare" (default) or "xkiro". */
  provider?: "cloudflare" | "xkiro";
  /** Provider-specific model id (xKiro). */
  model?: string;
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
    body: JSON.stringify({ prompt, ...(provider ? { provider } : {}), ...(model ? { model } : {}) }),
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

/** POSTs a source image + a change description to the Worker's xKiro image-edits
 * proxy and returns a data: URL for the edited result. Same conventions as
 * generateImage above. */
export async function editImage({
  workerUrl,
  password,
  prompt,
  image,
  model,
  signal,
}: {
  workerUrl: string;
  password?: string;
  prompt: string;
  /** Source image to edit, as a data: URL. */
  image: string;
  /** Provider-specific model id (xKiro). */
  model?: string;
  signal?: AbortSignal;
}): Promise<string> {
  if (!workerUrl) {
    throw new WorkerClientError("No Worker URL configured. Open Settings and paste your Cloudflare Worker URL.");
  }

  const res = await fetch(`${workerUrl.replace(/\/$/, "")}/api/image/edit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(password ? { "X-Scribble-Password": password } : {}),
    },
    body: JSON.stringify({ prompt, image, ...(model ? { model } : {}) }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new WorkerClientError((body as { error?: string } | null)?.error || `Image editing failed (${res.status})`);
  }

  const json = (await res.json()) as { dataUrl?: string };
  if (!json.dataUrl) {
    throw new WorkerClientError("Worker response had no image.");
  }
  return json.dataUrl;
}
