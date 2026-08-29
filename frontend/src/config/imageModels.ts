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
  /** Whether this backend can edit an existing image (xKiro's /v1/images/edits). */
  supportsEdit?: boolean;
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
    displayName: "GPT Image",
    desc: "Higher quality, slower — can also edit an image",
    supportsEdit: true,
  },
];

export const DEFAULT_IMAGE_MODEL_ID = "cf-flux-schnell";

/** Backend used when the user edits an image (attaches a source picture). xKiro
 * is the only provider with an edits endpoint, so edits always route here
 * regardless of the generation model picked in the header. */
export const EDIT_IMAGE_MODEL: ImageModelDef =
  IMAGE_MODELS.find((m) => m.supportsEdit) ?? IMAGE_MODELS[IMAGE_MODELS.length - 1];

export function findImageModel(id: string | undefined): ImageModelDef {
  return IMAGE_MODELS.find((m) => m.id === id) ?? IMAGE_MODELS[0];
}
