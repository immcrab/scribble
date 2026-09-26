import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, ImageOff, Images, Loader2, LogIn, Trash2, X } from "lucide-react";
import { LogoMark } from "../components/Logo";
import { useAuthStore } from "../state/authStore";
import { deleteLibraryItem, libraryImageUrl, listLibrary, type LibraryItem } from "../lib/libraryClient";

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Loads its image only once scrolled near the viewport, so a big library doesn't fetch everything up front. */
function LibraryImage({ id, thumb, alt, className }: { id: string; thumb: boolean; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    let cancelled = false;
    const load = () => {
      libraryImageUrl(id, thumb)
        .then((u) => !cancelled && setSrc(u))
        .catch(() => !cancelled && setFailed(true));
    };
    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [id, thumb]);

  return (
    <div ref={holder} className={`relative h-full w-full ${className ?? ""}`}>
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-base-850/60 text-slate-600">
          {failed ? <ImageOff size={22} /> : <Loader2 size={20} className="animate-spin" />}
        </div>
      )}
    </div>
  );
}

/** Everything the signed-in user has generated, saved privately to Cloudflare R2 (see worker/src/library.ts). */
export function LibraryPage({ onExit }: { onExit: () => void }) {
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<LibraryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (from: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const page = await listLibrary(from);
      setItems((prev) => (from ? [...prev, ...page.items] : page.items));
      setCursor(page.cursor);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your library.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load(null);
  }, [user, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const download = async (item: LibraryItem) => {
    const url = await libraryImageUrl(item.id, false);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lofin-${item.id}.${item.type === "image/jpeg" ? "jpg" : item.type.split("/")[1] || "png"}`;
    a.click();
  };

  const remove = async (item: LibraryItem) => {
    if (!window.confirm("Delete this image from your library? This can't be undone.")) return;
    setDeleting(true);
    try {
      await deleteLibraryItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setOpen(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete image.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-dvh w-full flex-col overflow-y-auto bg-base-950">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-base-700/60 bg-base-950/90 px-4 py-3 backdrop-blur">
        <button
          onClick={onExit}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-700/60 hover:text-white"
          title="Back to Lofin"
        >
          <ArrowLeft size={17} />
        </button>
        <LogoMark size={28} />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-white">Library</h1>
          <p className="truncate text-xs text-slate-500">
            {items.length > 0 ? `${items.length} saved image${items.length === 1 ? "" : "s"}` : "Images you've generated"}
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {authLoading ? null : !user ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <LogIn size={30} className="text-slate-600" />
            <p className="text-sm text-slate-400">Sign in to see the images you've generated.</p>
            <button
              onClick={onExit}
              className="rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-base-950 hover:bg-accent-400"
            >
              Back to Lofin
            </button>
          </div>
        ) : error && items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <p className="text-sm text-red-300">{error}</p>
            <button
              onClick={() => load(null)}
              className="rounded-xl border border-base-600 px-4 py-2 text-sm text-slate-200 hover:bg-base-800"
            >
              Try again
            </button>
          </div>
        ) : !loaded ? (
          <div className="flex justify-center py-20 text-slate-500">
            <Loader2 className="animate-spin" size={22} />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Images size={34} className="text-slate-600" />
            <p className="text-sm text-slate-400">No saved images yet.</p>
            <p className="max-w-xs text-xs text-slate-500">
              Images you make in Image mode are saved here automatically while you're signed in.
            </p>
          </div>
        ) : (
          <>
            {error && <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setOpen(item)}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-base-600/60 bg-base-900/60 text-left shadow-panel transition-transform hover:-translate-y-0.5 hover:border-accent-500/50"
                  title={item.prompt || "Generated image"}
                >
                  <LibraryImage id={item.id} thumb alt={item.prompt || "Generated image"} />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 pt-8 opacity-0 transition-opacity group-hover:opacity-100">
                    <p className="line-clamp-2 text-xs text-white">{item.prompt || "Generated image"}</p>
                  </div>
                </button>
              ))}
            </div>
            {cursor && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => load(cursor)}
                  disabled={loading}
                  className="rounded-xl border border-base-600 px-4 py-2 text-sm text-slate-200 hover:bg-base-800 disabled:opacity-50"
                >
                  {loading ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-base-600/60 bg-base-900 shadow-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40">
              <div className="max-h-[70vh] w-full">
                <FullImage id={open.id} alt={open.prompt || "Generated image"} />
              </div>
            </div>
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{open.prompt || "Generated image"}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {[open.model, formatDate(open.createdAt)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => download(open)}
                  className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-base-950 hover:bg-accent-400"
                >
                  <Download size={15} /> Download
                </button>
                <button
                  onClick={() => remove(open)}
                  disabled={deleting}
                  className="flex items-center gap-1.5 rounded-lg border border-base-600 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                >
                  <Trash2 size={15} /> Delete
                </button>
                <button
                  onClick={() => setOpen(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-700/60 hover:text-white"
                  title="Close"
                >
                  <X size={17} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Full-size view: shows the already-cached thumbnail immediately, swaps to the original when it arrives. */
function FullImage({ id, alt }: { id: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    libraryImageUrl(id, true)
      .then((u) => !cancelled && setSrc((cur) => cur ?? u))
      .catch(() => {});
    libraryImageUrl(id, false)
      .then((u) => !cancelled && setSrc(u))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);
  return src ? (
    <img src={src} alt={alt} className="mx-auto max-h-[70vh] w-auto max-w-full object-contain" />
  ) : (
    <div className="flex h-64 items-center justify-center text-slate-500">
      <Loader2 className="animate-spin" size={22} />
    </div>
  );
}
