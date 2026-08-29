/** Stamps a text watermark onto a generated image.
 *
 * Takes a data: URL, draws it to a canvas, adds a small semi-transparent
 * label in the bottom-right corner, and returns a new PNG data: URL. Text,
 * opacity, and size come from the admin catalog (see lib/catalogSync.ts's
 * `watermarkConfig`); defaults match `DEFAULT_WATERMARK`. If anything goes
 * wrong (canvas unavailable, decode failure) the original URL is returned
 * unchanged so image generation never breaks over a cosmetic step. */
export async function watermarkImage(
  dataUrl: string,
  opts: { text?: string; opacity?: number; scale?: number } = {},
): Promise<string> {
  const text = (opts.text ?? "ScribbleAI").trim() || "ScribbleAI";
  const opacity = clamp(opts.opacity ?? 0.55, 0, 1);
  const scale = clamp(opts.scale ?? 0.028, 0.005, 0.15);

  try {
    const img = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.width || !canvas.height) return dataUrl;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Scale the label to the image; clamp so it stays readable but unobtrusive.
    const fontSize = Math.max(12, Math.min(48, Math.round(canvas.width * scale)));
    const pad = Math.round(fontSize * 0.7);
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "right";

    const x = canvas.width - pad;
    const y = canvas.height - pad;

    ctx.shadowColor = `rgba(0, 0, 0, ${clamp(opacity * 0.65, 0, 1)})`;
    ctx.shadowBlur = Math.round(fontSize * 0.35);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.fillText(text, x, y);

    return canvas.toDataURL("image/png");
  } catch {
    return dataUrl;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}
