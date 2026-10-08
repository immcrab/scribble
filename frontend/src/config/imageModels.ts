/**
 * Image-mode backends. Unlike the chat catalog (config/models.ts), image
 * generation has its own tiny fixed list: the Worker's /api/image/generate
 * routes on the `provider` field below and, for xKiro, forwards `model`
 * straight to https://api.xkiro.com/v1/images/generations.
 */
import type { ImageBilling } from "../lib/usage";

/** Speed/detail presets. Mapped to a concrete step count per model (see `options.steps`). */
export type ImageQuality = "fast" | "balanced" | "detailed";
export type ImageAspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

export const IMAGE_QUALITIES: { id: ImageQuality; label: string; hint: string }[] = [
  { id: "fast", label: "Fast", hint: "Quickest draft" },
  { id: "balanced", label: "Balanced", hint: "Good default" },
  { id: "detailed", label: "Detailed", hint: "Slower, more refined" },
];
export const DEFAULT_IMAGE_QUALITY: ImageQuality = "balanced";

/** Which advanced controls a backend actually honours — the UI disables the rest. */
export interface ImageOptionSupport {
  /** Accepts a "what to avoid" prompt. */
  negativePrompt: boolean;
  /** Accepts a fixed seed for reproducible results. */
  seed: boolean;
  /** Honours the chosen aspect ratio. */
  size: boolean;
  /** Sampler steps per quality preset; absent when the backend has no such control. */
  steps?: Record<ImageQuality, number>;
}

/** Cloudflare Stable Diffusion canvas sizes — multiples of 8, kept near 1MP so generations stay fast. */
export const CLOUDFLARE_SIZES: Record<ImageAspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "3:4": { width: 768, height: 1024 },
  "4:3": { width: 1024, height: 768 },
  "9:16": { width: 576, height: 1024 },
  "16:9": { width: 1024, height: 576 },
};

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
  /** Advanced controls this backend honours. */
  options: ImageOptionSupport;
}

export const IMAGE_MODELS: ImageModelDef[] = [
  {
    id: "cf-flux-schnell",
    provider: "cloudflare",
    model: "@cf/black-forest-labs/flux-1-schnell",
    displayName: "FLUX.1 Schnell",
    desc: "Cloudflare Workers AI · fast draft generation · limited",
    billing: "cloudflare",
    options: { negativePrompt: false, seed: false, size: false, steps: { fast: 2, balanced: 4, detailed: 8 } },
  },
  {
    id: "cf-dreamshaper-8-lcm",
    provider: "cloudflare",
    model: "@cf/lykon/dreamshaper-8-lcm",
    displayName: "DreamShaper 8 LCM",
    desc: "Cloudflare Workers AI · photorealistic styles · limited",
    billing: "cloudflare",
    options: { negativePrompt: true, seed: true, size: true, steps: { fast: 4, balanced: 8, detailed: 12 } },
  },
  {
    id: "cf-sdxl-base",
    provider: "cloudflare",
    model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    displayName: "Stable Diffusion XL",
    desc: "Cloudflare Workers AI · detailed compositions · limited",
    billing: "cloudflare",
    options: { negativePrompt: true, seed: true, size: true, steps: { fast: 10, balanced: 16, detailed: 20 } },
  },
  {
    id: "cf-sdxl-lightning",
    provider: "cloudflare",
    model: "@cf/bytedance/stable-diffusion-xl-lightning",
    displayName: "SDXL Lightning",
    desc: "Cloudflare Workers AI · rapid SDXL generation · limited",
    billing: "cloudflare",
    options: { negativePrompt: true, seed: true, size: true, steps: { fast: 4, balanced: 6, detailed: 8 } },
  },
  {
    id: "xkiro-sensenova-u1.5-lite",
    provider: "xkiro",
    model: "sensenova/sensenova-u1.5-lite",
    displayName: "SenseNova U1.5 Lite",
    desc: "Cheap and quick — supports image generation and editing",
    billing: "xkiro-free",
    options: { negativePrompt: false, seed: false, size: true },
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
  options: { negativePrompt: false, seed: false, size: true },
};

export function findImageModel(id: string | undefined): ImageModelDef {
  return IMAGE_MODELS.find((m) => m.id === id) ?? IMAGE_MODELS[0];
}

/** A fresh seed in Stable Diffusion's 32-bit range. */
export function randomImageSeed(): number {
  return Math.floor(Math.random() * 4_294_967_295);
}
