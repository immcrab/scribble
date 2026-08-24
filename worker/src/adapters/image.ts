/**
 * Cloudflare Workers AI text-to-image. Default model returns a base64-encoded
 * JPEG directly in the JSON body (no binary streaming to juggle), which is
 * why it's the default over the Stable Diffusion models that return raw bytes.
 */
const DEFAULT_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export async function generateImage({
  accountId,
  apiToken,
  model,
  prompt,
}: {
  accountId: string;
  apiToken: string;
  model?: string;
  prompt: string;
}): Promise<{ dataUrl: string }> {
  const resolvedModel = model || DEFAULT_MODEL;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${resolvedModel}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    throw new Error(`Cloudflare Workers AI error ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { result?: { image?: string }; errors?: { message?: string }[] };
  const image = json.result?.image;
  if (!image) {
    const message = json.errors?.[0]?.message || "Image generation returned no image.";
    throw new Error(message);
  }

  return { dataUrl: `data:image/jpeg;base64,${image}` };
}
