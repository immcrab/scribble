import { useState } from "react";
import { ExternalLink, Maximize2, Minimize2, Presentation, X } from "lucide-react";

function slidesEmbedUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return null;
    const match = url.pathname.match(/^\/presentation\/d\/([A-Za-z0-9_-]{16,160})(?:\/|$)/);
    if (!match) return null;
    return `https://docs.google.com/presentation/d/${match[1]}/embed?start=false&loop=false&delayms=3000`;
  } catch {
    return null;
  }
}

/** A compact, first-party Google Slides viewer for a presentation just created by an approved app action. */
export function GoogleSlidesPreview({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const embedUrl = slidesEmbedUrl(url);
  if (!embedUrl) return null;

  return (
    <section className={`mb-3 overflow-hidden rounded-2xl border border-accent-500/35 bg-base-900/80 shadow-lg ${expanded ? "fixed inset-4 z-50 m-0 flex flex-col" : ""}`} aria-label="Google Slides preview">
      <div className="flex items-center gap-2 border-b border-accent-500/20 px-3 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-500/15 text-accent-200"><Presentation size={15} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white">Presentation preview</p>
          <p className="truncate text-[11px] text-slate-500">Created in Google Slides</p>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-accent-200 hover:bg-accent-500/10">
          Open <ExternalLink size={12} />
        </a>
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Use compact preview" : "Expand preview"} className="rounded-lg p-1.5 text-slate-400 hover:bg-base-700 hover:text-white">
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="rounded-lg p-1.5 text-slate-400 hover:bg-base-700 hover:text-white" aria-label={open ? "Close presentation preview" : "Show presentation preview"}>
          <X size={14} className={open ? "" : "rotate-45"} />
        </button>
      </div>
      {open && (
        <div className={`bg-black/20 p-2 ${expanded ? "min-h-0 flex-1" : ""}`}>
          <iframe
            src={embedUrl}
            title={label}
            className={`w-full rounded-xl border border-base-700/50 bg-base-950 ${expanded ? "h-full min-h-[18rem]" : "aspect-video"}`}
            allowFullScreen
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </section>
  );
}