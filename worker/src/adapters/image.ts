/**
 * Cloudflare Workers AI text-to-image.
 *
 * Two response shapes exist: FLUX returns `{ result: { image: <base64 jpeg> } }`
 * as JSON, while the Stable Diffusion family (SDXL, SDXL Lightning, DreamShaper)
 * returns the raw PNG bytes. Both are normalised to a base64 data: URL here so the
 * frontend stores every backend identically.
 *
 * Request parameters also differ by family — FLUX takes only `prompt` + `steps`
 * (max 8); the SD models take `negative_prompt`, `num_steps` (max 20), `seed`,
 * `width` and `height`. Unsupported options are simply not sent.
 */
const DEFAULT_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export interface CloudflareImageOptions {
  /** Things to steer away from (Stable Diffusion models only). */
  negativePrompt?: string;
  /** Sampler steps; clamped to the model's maximum. */
  steps?: number;
  /** Reproducible-seed (Stable Diffusion models only). */
  seed?: number;
  /** Output size in px, multiples of 8 between 256 and 2048 (Stable Diffusion models only). */
  width?: number;
  height?: number;
}

function isFlux(model: string): boolean {
  return model.includes("flux");
}

function clampInt(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Builds the model-specific JSON body, dropping anything the model doesn't accept. */
export function buildCloudflareImageBody(model: string, prompt: string, options: CloudflareImageOptions = {}): Record<string, unknown> {
  if (isFlux(model)) {
    const steps = clampInt(options.steps, 1, 8);
    return { prompt, ...(steps ? { steps } : {}) };
  }
  const body: Record<string, unknown> = { prompt };
  const negative = options.negativePrompt?.trim();
  if (negative) body.negative_prompt = negative.slice(0, 1000);
  const steps = clampInt(options.steps, 1, 20);
  if (steps) body.num_steps = steps;
  const seed = clampInt(options.seed, 0, 4_294_967_295);
  if (seed !== undefined) body.seed = seed;
  const width = clampInt(options.width, 256, 2048);
  const height = clampInt(options.height, 256, 2048);
  if (width && height) {
    body.width = Math.round(width / 8) * 8;
    body.height = Math.round(height / 8) * 8;
  }
  return body;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function generateImage({
  accountId,
  apiToken,
  model,
  prompt,
  options,
}: {
  accountId: string;
  apiToken: string;
  model?: string;
  prompt: string;
  options?: CloudflareImageOptions;
}): Promise<{ dataUrl: string }> {
  const resolvedModel = model || DEFAULT_MODEL;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${resolvedModel}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(buildCloudflareImageBody(resolvedModel, prompt, options)),
  });

  if (!res.ok) {
    throw new Error(`Cloudflare Workers AI error ${res.status}: ${await res.text()}`);
  }

  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType.startsWith("image/")) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length) throw new Error("Image generation returned no image.");
    return { dataUrl: `data:${contentType};base64,${bytesToBase64(bytes)}` };
  }

  const json = (await res.json()) as { result?: { image?: string }; errors?: { message?: string }[] };
  const image = json.result?.image;
  if (!image) {
    const message = json.errors?.[0]?.message || "Image generation returned no image.";
    throw new Error(message);
  }

  return { dataUrl: `data:image/jpeg;base64,${image}` };
}
