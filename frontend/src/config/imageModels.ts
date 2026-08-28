/**
 * Image-mode backends. Unlike the chat catalog (config/models.ts), image
 * generation has its own tiny fixed list: the Worker's /api/image/generate
 * routes on the `provider` field below and, for xKiro, forwards `model`
 * straight to https://api.xkiro.com/v1/images/generations.
 */
export interface ImageModelDef {
  /** Selector id, persisted as settings.imageModelId. */
  id: string;
  /** Routed on by the Worker — "cloudflare" (default) or "xkiro". */
  provider: "cloudflare" | "xkiro";
  /** Wire model id sent to the provider. Cloudflare uses the Worker's own default. */
  model?: string;
  displayName: string;
  desc: string;
}

export const IMAGE_MODELS: ImageModelDef[] = [
  {
    id: "cf-flux-schnell",
    provider: "cloudflare",
    displayName: "Cloudflare Flux",
    desc: "Fast, runs on Cloudflare Workers AI",
  },
  {
    id: "xkiro-gpt-image",
    provider: "xkiro",
    model: "gpt-image",
    displayName: "xKiro GPT Image",
    desc: "Higher quality, slower — async job on xKiro",
  },
];

export const DEFAULT_IMAGE_MODEL_ID = "cf-flux-schnell";

export function findImageModel(id: string | undefined): ImageModelDef {
  return IMAGE_MODELS.find((m) => m.id === id) ?? IMAGE_MODELS[0];
}
