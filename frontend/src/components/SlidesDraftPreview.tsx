import { FilePenLine, Presentation } from "lucide-react";

function markdownFrom(value: unknown, depth = 0, key = ""): string | null {
  if (depth > 5) return null;
  if (typeof value === "string") {
    return /markdown|content|body|slides?/i.test(key) && value.trim().length > 12 ? value.trim() : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = markdownFrom(item, depth + 1, key);
      if (found) return found;
    }
  } else if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) {
      const found = markdownFrom(child, depth + 1, childKey);
      if (found) return found;
    }
  }
  return null;
}

function slideSections(markdown: string): string[] {
  const separated = markdown.split(/\n\s*---+\s*\n/).map((section) => section.trim()).filter(Boolean);
  if (separated.length > 1) return separated.slice(0, 12);
  const headed = markdown.split(/(?=^#{1,3}\s+)/m).map((section) => section.trim()).filter(Boolean);
  return headed.slice(0, 12);
}

/** Shows the artifact content that will be sent to the rich Google Slides tool before approval. */
export function SlidesDraftPreview({ arguments: args }: { arguments: Record<string, unknown> }) {
  const markdown = markdownFrom(args);
  if (!markdown) return null;
  const slides = slideSections(markdown);
  if (!slides.length) return null;
  const first = slides[0];
  const title = first.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim() ?? "Presentation";
  const body = first
    .split("\n")
    .map((line) => line.replace(/^#{1,3}\s+|^[-*]\s+/, "").trim())
    .filter((line) => line && line !== title)
    .slice(0, 4);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-accent-500/30 bg-base-900/70">
      <div className="flex items-center gap-2 border-b border-accent-500/20 px-3 py-2 text-[11px] font-medium text-accent-200"><FilePenLine size={13} />Slide content preview <span className="ml-auto text-slate-500">{slides.length} slides</span></div>
      <div className="p-2">
        <div className="aspect-video rounded-lg border border-base-700/60 bg-gradient-to-br from-slate-900 via-slate-950 to-accent-950/50 p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-300"><Presentation size={11} />Slide 1 of {slides.length}</div>
          <h4 className="mt-5 text-lg font-semibold leading-tight text-white">{title}</h4>
          {body.length > 0 && <ul className="mt-3 space-y-1 text-xs leading-relaxed text-slate-300">{body.map((line, index) => <li key={`${line}-${index}`}>• {line}</li>)}</ul>}
        </div>
        <p className="px-1 pt-2 text-[10px] text-slate-500">This is the content that will be created in Google Slides after approval.</p>
      </div>
    </div>
  );
}