/**
 * Downscale an image File to a reasonably sized data: URL before it's sent to
 * the Worker. Mirrors the sizing Composer.tsx does for chat attachments — keep
 * base64 payloads small enough for the Worker/provider while preserving enough
 * detail. Falls back to the raw FileReader result if canvas decoding fails.
 */
export function fileToPreparedDataUrl(file: File, maxDimension = 2048): Promise<{ dataUrl: string; type: string; size: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const raw = reader.result as string;
      const image = new Image();
      image.onerror = () => reject(new Error("That file isn't a readable image."));
      image.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({ dataUrl: raw, type: file.type || "image/png", size: Math.ceil((raw.length * 3) / 4) });
          return;
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const type = file.type === "image/png" ? "image/png" : "image/jpeg";
        const dataUrl = canvas.toDataURL(type, type === "image/jpeg" ? 0.86 : undefined);
        resolve({ dataUrl, type, size: Math.ceil((dataUrl.length * 3) / 4) });
      };
      image.src = raw;
    };
    reader.readAsDataURL(file);
  });
}
