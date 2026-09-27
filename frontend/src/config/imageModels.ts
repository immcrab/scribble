/**
 * Image-mode backends. Unlike the chat catalog (config/models.ts), image
 * generation has its own tiny fixed list: the Worker's /api/image/generate
 * routes on the `provider` field below and, for xKiro, forwards `model`
 * straight to https://api.xkiro.com/v1/images/generations.
 */
import type { ImageBilling } from "../lib/usage";

export interface ImageModelDef {
  /** Selector id, persisted as settings.imageModelId. */
  id: string;
  /** Routed on by the Worker. */
  provider: "cloudflare" | "xkiro";
  /** Wire model id sent to the provider. Cloudflare uses the Worker's default. */
  model?: string;
  displayName: string;
  desc: string;
  /** Whether this backend can edit an existing image (xKiro's /v1/images/edits). */
  supportsEdit?: boolean;
  /** Credit bucket this model's images are charged to (lib/usage.ts). */
  billing: ImageBilling;
}

export const IMAGE_MODELS: ImageModelDef[] = [
  {
    id: "cf-flux-schnell",
    provider: "cloudflare",
    displayName: "Cloudflare Flux",
    desc: "Fast, runs on Cloudflare Workers AI",
    billing: "cloudflare",
  },
  {
    id: "xkiro-sensenova-u1.5-lite",
    provider: "xkiro",
    model: "sensenova/sensenova-u1.5-lite",
    displayName: "SenseNova U1.5 Lite",
    desc: "Cheap and quick — generation only, no edits",
    billing: "xkiro-free",
  },
];

export const DEFAULT_IMAGE_MODEL_ID = "cf-flux-schnell";

/** Image editing is disabled: it has no verified free backend. Kept as a
 * compatibility fallback for stored settings; the Worker rejects edit calls. */
export const EDIT_IMAGE_MODEL: ImageModelDef =
  IMAGE_MODELS[0];

export function findImageModel(id: string | undefined): ImageModelDef {
  return IMAGE_MODELS.find((m) => m.id === id) ?? IMAGE_MODELS[0];
}
