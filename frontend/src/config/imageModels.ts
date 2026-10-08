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
  /** Wire model id sent to the provider. Cloudflare and xKiro model IDs are forwarded to the Worker. */
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
    model: "@cf/black-forest-labs/flux-1-schnell",
    displayName: "FLUX.1 Schnell",
    desc: "Cloudflare Workers AI · fast draft generation · limited",
    billing: "cloudflare",
  },
  {
    id: "cf-dreamshaper-8-lcm",
    provider: "cloudflare",
    model: "@cf/lykon/dreamshaper-8-lcm",
    displayName: "DreamShaper 8 LCM",
    desc: "Cloudflare Workers AI · photorealistic styles · limited",
    billing: "cloudflare",
  },
  {
    id: "cf-sdxl-base",
    provider: "cloudflare",
    model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    displayName: "Stable Diffusion XL",
    desc: "Cloudflare Workers AI · detailed compositions · limited",
    billing: "cloudflare",
  },
  {
    id: "cf-sdxl-lightning",
    provider: "cloudflare",
    model: "@cf/bytedance/stable-diffusion-xl-lightning",
    displayName: "SDXL Lightning",
    desc: "Cloudflare Workers AI · rapid SDXL generation · limited",
    billing: "cloudflare",
  },
  {
    id: "xkiro-sensenova-u1.5-lite",
    provider: "xkiro",
    model: "sensenova/sensenova-u1.5-lite",
    displayName: "SenseNova U1.5 Lite",
    desc: "Cheap and quick — supports image generation and editing",
    billing: "xkiro-free",
  },
];

export const DEFAULT_IMAGE_MODEL_ID = "cf-flux-schnell";

/** Image edits use the free SenseNova backend, regardless of the generation
 * model selected in the Image-mode header. */
export const EDIT_IMAGE_MODEL: ImageModelDef = {
  id: "xkiro-sensenova-u1.5-lite-edit",
  provider: "xkiro",
  model: "sensenova/sensenova-u1.5-lite",
  displayName: "SenseNova U1.5 Lite",
  desc: "Free image editing and re-framing",
  supportsEdit: true,
  billing: "xkiro-free",
};

export function findImageModel(id: string | undefined): ImageModelDef {
  return IMAGE_MODELS.find((m) => m.id === id) ?? IMAGE_MODELS[0];
}
