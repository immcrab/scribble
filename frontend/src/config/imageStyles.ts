/**
 * Image-mode style presets. Purely client-side: each preset appends a short
 * modifier clause to the user's prompt before it's sent to the Worker's
 * /api/image/generate (see modes/ImageMode.tsx). The user message shown in
 * the transcript keeps the original, undecorated text.
 *
 * Selected id is persisted as settings.imageStyleId. "none" = send the
 * prompt untouched.
 */
export interface ImageStyleDef {
  /** Selector id, persisted as settings.imageStyleId. */
  id: string;
  label: string;
  /** Appended to the prompt as ", <suffix>". Empty for "none". */
  suffix: string;
}

export const IMAGE_STYLES: ImageStyleDef[] = [
  { id: "none", label: "No style", suffix: "" },
  {
    id: "realistic",
    label: "Realistic",
    suffix:
      "photorealistic, high detail, natural lighting, sharp focus, shot on a 50mm lens",
  },
  {
    id: "animated",
    label: "Animated",
    suffix:
      "3D animated movie style, Pixar-like, soft global illumination, expressive, vibrant colors",
  },
  {
    id: "anime",
    label: "Anime",
    suffix:
      "anime style, cel shaded, clean line art, vivid colors, detailed background, studio production quality",
  },
  {
    id: "digital-art",
    label: "Digital art",
    suffix:
      "digital painting, concept art, trending on ArtStation, dramatic lighting, highly detailed",
  },
  {
    id: "oil-painting",
    label: "Oil painting",
    suffix:
      "oil painting, visible brush strokes, canvas texture, rich impasto, classical composition",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    suffix:
      "watercolor painting, soft washes, bleeding pigments, textured paper, loose and airy",
  },
  {
    id: "pixel-art",
    label: "Pixel art",
    suffix: "pixel art, 16-bit, limited palette, crisp pixels, retro game sprite",
  },
  {
    id: "3d-render",
    label: "3D render",
    suffix:
      "octane render, 3D, physically based materials, studio lighting, ray traced reflections, 8k",
  },
  {
    id: "low-poly",
    label: "Low poly",
    suffix:
      "low poly 3D, faceted geometry, flat shading, minimal palette, isometric",
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    suffix:
      "cyberpunk, neon lighting, rain-soaked streets, holograms, dark atmosphere, cinematic",
  },
  {
    id: "fantasy",
    label: "Fantasy",
    suffix:
      "epic fantasy art, magical atmosphere, painterly, golden hour, sweeping landscape, matte painting",
  },
  {
    id: "comic",
    label: "Comic book",
    suffix:
      "comic book art, bold ink outlines, halftone shading, dynamic panel composition, saturated colors",
  },
  {
    id: "line-art",
    label: "Line art",
    suffix:
      "minimalist black and white line art, single continuous line, clean vector, lots of negative space",
  },
  {
    id: "vintage-photo",
    label: "Vintage photo",
    suffix:
      "vintage film photograph, 35mm, faded colors, grain, light leaks, 1970s aesthetic",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    suffix:
      "cinematic still, anamorphic, shallow depth of field, moody color grade, dramatic key light, film grain",
  },
];

export const DEFAULT_IMAGE_STYLE_ID = "none";

export function findImageStyle(id: string | undefined): ImageStyleDef {
  return IMAGE_STYLES.find((s) => s.id === id) ?? IMAGE_STYLES[0];
}

/** Appends the style's modifier clause to a prompt. Returns the prompt
 * unchanged for "none" or an unknown id. */
export function applyImageStyle(prompt: string, id: string | undefined): string {
  const style = findImageStyle(id);
  if (!style.suffix) return prompt;
  return `${prompt.replace(/[\s,]+$/, "")}, ${style.suffix}`;
}
