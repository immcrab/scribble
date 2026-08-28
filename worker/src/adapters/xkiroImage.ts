/**
 * xKiro text-to-image — https://docs.xkiro.com/models/image/
 *
 * Unlike Cloudflare Workers AI (adapters/image.ts), xKiro's image API is an
 * asynchronous job queue: POST returns 202 with a job id, and the image only
 * shows up after polling GET /v1/images/generations/{id} until the job reaches
 * a terminal status. We poll here (inside the request) and hand the caller a
 * base64 data: URL — same shape adapters/image.ts returns — so the frontend
 * stores both backends' output identically.
 */
const XKIRO_IMAGE_URL = "https://api.xkiro.com/v1/images/generations";
const DEFAULT_MODEL = "gpt-image";
const POLL_INTERVAL_MS = 2500;
const MAX_POLL_MS = 90_000;

interface XkiroJob {
  id?: string;
  status?: string;
  data?: { url?: string }[];
  error?: { message?: string } | string;
}

export async function generateXkiroImage({
  apiKey,
  model,
  prompt,
  size,
}: {
  apiKey: string;
  model?: string;
  prompt: string;
  size?: string;
}): Promise<{ dataUrl: string }> {
  const submit = await fetch(XKIRO_IMAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: model || DEFAULT_MODEL, prompt, size: size || "1024x1024", n: 1 }),
  });

  if (!submit.ok) {
    throw new Error(`xKiro image error ${submit.status}: ${await submit.text()}`);
  }

  const job = (await submit.json()) as XkiroJob;
  if (!job.id) {
    throw new Error("xKiro image API returned no job id.");
  }

  const imageUrl = await pollForImage(apiKey, job.id, job);
  return { dataUrl: await toDataUrl(imageUrl) };
}

async function pollForImage(apiKey: string, id: string, initial: XkiroJob): Promise<string> {
  const deadline = Date.now() + MAX_POLL_MS;
  let job = initial;

  for (;;) {
    if (job.status === "succeeded") {
      const url = job.data?.[0]?.url;
      if (!url) throw new Error("xKiro image job succeeded but returned no image URL.");
      return url;
    }
    if (job.status === "failed" || job.status === "blocked" || job.status === "canceled" || job.status === "cancelled") {
      const message = typeof job.error === "string" ? job.error : job.error?.message;
      throw new Error(message || `xKiro image job ${job.status}.`);
    }
    if (Date.now() > deadline) {
      throw new Error("xKiro image generation timed out.");
    }

    await sleep(POLL_INTERVAL_MS);

    const res = await fetch(`${XKIRO_IMAGE_URL}/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`xKiro image poll error ${res.status}: ${await res.text()}`);
    }
    job = (await res.json()) as XkiroJob;
  }
}

/** Fetch the CDN image xKiro produced and inline it as a base64 data: URL. */
async function toDataUrl(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Fetching the generated image failed (${res.status}).`);
  }
  const contentType = res.headers.get("Content-Type") || "image/png";
  const bytes = new Uint8Array(await res.arrayBuffer());

  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
