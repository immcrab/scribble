import type { Attachment } from "../types";

const TEXT_TYPES = /^(text\/|application\/(json|javascript|typescript|xml)|application\/x-(javascript|typescript))/;
const TEXT_EXTENSIONS = /\.(txt|md|csv|json|ya?ml|js|jsx|ts|tsx|py|html?|css|sql|xml)$/i;
const MAX_CHARS_PER_FILE = 12_000;

function decodeDataUrl(dataUrl: string): string | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  try { return header.includes(";base64") ? decodeURIComponent(escape(atob(payload))) : decodeURIComponent(payload); } catch { return null; }
}

/** Turns supported text attachments into bounded context for Agent Mode. Binary files
 * remain attached for vision-capable providers, but are never misrepresented as read. */
export function analysisContext(attachments: Attachment[]): { context: string; skipped: string[] } {
  const extracted: string[] = [];
  const skipped: string[] = [];
  for (const attachment of attachments) {
    if (attachment.type.startsWith("image/")) continue;
    if (!TEXT_TYPES.test(attachment.type) && !TEXT_EXTENSIONS.test(attachment.name)) { skipped.push(attachment.name); continue; }
    const text = decodeDataUrl(attachment.dataUrl);
    if (!text) { skipped.push(attachment.name); continue; }
    extracted.push(`--- ${attachment.name} ---\n${text.slice(0, MAX_CHARS_PER_FILE)}${text.length > MAX_CHARS_PER_FILE ? "\n[truncated]" : ""}`);
  }
  return { context: extracted.join("\n\n"), skipped };
}
