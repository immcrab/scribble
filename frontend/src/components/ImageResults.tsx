import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, ImageIcon, X } from "lucide-react";
import type { FoundImage, ToolCallRecord } from "../types";

const isHttps = (value: string) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/** Image with an optional fallback source (the viewer falls back to the thumbnail when the
 * full-size copy won't load). Flickr refuses requests sent with no referrer, so the
 * default referrer policy (origin only, cross-site) is kept. */
function Picture({ src, fallback, alt, className }: { src: string; fallback?: string; alt: string; className: string }) {
  const [attempt, setAttempt] = useState(0);
  const sources = fallback && fallback !== src ? [src, fallback] : [src];
  if (attempt >= sources.length) {
    return (
      <span className={`flex min-h-24 items-center justify-center bg-base-800 text-slate-600 ${className}`}>
        <ImageIcon size={18} />
      </span>
    );
  }
  return <img src={sources[attempt]} alt={alt} loading="lazy" onError={() => setAttempt((n) => n + 1)} className={className} />;
}

/** Images found for a "find me pictures of…" request: a thumbnail grid, and a larger
 * view with credit and a link to the source page when one is picked. */
export function ImageResults({ toolCall }: { toolCall: ToolCallRecord }) {
  const images = (toolCall.images ?? []).filter((img) => isHttps(img.url) && isHttps(img.thumbnail));
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  if (!images.length) return null;

  const query = typeof toolCall.input?.query === "string" ? toolCall.input.query : "";
  const current: FoundImage | undefined = selected === null ? undefined : images[selected];
  const step = (delta: number) => setSelected((i) => (i === null ? i : (i + delta + images.length) % images.length));

  return (
    <section className="mb-3 max-w-xl overflow-hidden rounded-2xl border border-base-700/60 bg-base-900/70 shadow-lg" aria-label="Image results">
      <div className="flex items-center gap-2 border-b border-base-700/60 px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-300">
          <ImageIcon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white">Images</p>
          {query && <p className="truncate text-[11px] text-slate-500">{query}</p>}
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? "Collapse images" : "Expand images"}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-base-700 hover:text-white"
        >
          <ChevronDown size={14} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
      </div>

      {open && current && (
        <div className="border-b border-base-700/60">
          <div className="relative flex min-h-48 max-h-96 items-center justify-center bg-black">
            <Picture key={current.url} src={current.url} fallback={current.thumbnail} alt={current.title} className="max-h-96 w-auto max-w-full object-contain" />
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close image"
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
            >
              <X size={14} />
            </button>
            {images.length > 1 && (
              <>
                <button type="button" onClick={() => step(-1)} aria-label="Previous image" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80">
                  <ChevronLeft size={16} />
                </button>
                <button type="button" onClick={() => step(1)} aria-label="Next image" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80">
                  <ChevronRight size={16} />
                </button>
              </>
            )}
          </div>
          <div className="flex items-start gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium text-white">{current.title}</p>
              {(current.creator || current.license) && (
                <p className="mt-0.5 truncate text-[11px] text-slate-500">{[current.creator, current.license].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            {isHttps(current.source) && (
              <a
                href={current.source}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-base-700/60 hover:text-white"
              >
                Source <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      )}

      {open && (
        <ul className="grid grid-cols-3 gap-1.5 p-1.5 sm:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.url}>
              <button
                type="button"
                onClick={() => setSelected(i)}
                aria-label={`View ${img.title}`}
                aria-current={selected === i}
                className={`block aspect-square w-full overflow-hidden rounded-lg bg-base-800 ring-accent-400 transition ${selected === i ? "ring-2" : "hover:opacity-90"}`}
              >
                <Picture src={img.thumbnail} alt={img.title} className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
