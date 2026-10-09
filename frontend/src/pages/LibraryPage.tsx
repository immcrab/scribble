import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, AudioLines, Download, File, FileCode2, Image as ImageIcon, ImageOff, Images, Loader2, LogIn, Trash2, X, Search, SlidersHorizontal } from "lucide-react";
import { LogoMark } from "../components/Logo";
import { useAuthStore } from "../state/authStore";
import { useChatStore } from "../state/chatStore";
import { deleteLibraryItem, libraryImageUrl, listStorage, type LibraryItem } from "../lib/libraryClient";

type LibraryTab = "generated" | "uploaded" | "speech" | "files";
const TABS: Array<{ id: LibraryTab; label: string; icon: typeof Images }> = [
  { id: "generated", label: "Generated", icon: Images },
  { id: "uploaded", label: "Uploaded", icon: ImageIcon },
  { id: "speech", label: "Speech", icon: AudioLines },
  { id: "files", label: "Files", icon: FileCode2 },
];

function formatDate(ms: number): string { return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function extension(item: LibraryItem): string { return item.name?.includes(".") ? item.name.slice(item.name.lastIndexOf(".") + 1) : item.type === "image/jpeg" ? "jpg" : item.type.split("/")[1] || "file"; }
function titleFor(item: LibraryItem): string { return item.name || item.prompt || (item.category === "speech" ? "Generated speech" : "Generated file"); }
function inTab(item: LibraryItem, tab: LibraryTab, isKnownUpload: boolean): boolean {
  // Older object-store entries predate source categories. Chat attachment ids
  // are stable, so recognize those uploads immediately while the background
  // backfill updates their cloud metadata for every device.
  const category = isKnownUpload ? "uploaded" : item.category;
  if (tab === "generated") return category === "generated" && item.type.startsWith("image/");
  if (tab === "uploaded") return category === "uploaded" && item.type.startsWith("image/");
  if (tab === "speech") return item.category === "speech" || item.type.startsWith("audio/");
  return item.kind === "website" || item.category === "file" || (!item.type.startsWith("image/") && !item.type.startsWith("audio/"));
}

/** Loads a private R2 object only when it is about to appear on screen. */
function LibraryImage({ id, alt }: { id: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = holder.current; if (!el) return;
    let cancelled = false;
    const load = () => libraryImageUrl(id, true).then((url) => !cancelled && setSrc(url)).catch(() => !cancelled && setFailed(true));
    if (typeof IntersectionObserver === "undefined") { load(); return () => { cancelled = true; }; }
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); load(); } }, { rootMargin: "300px" });
    observer.observe(el);
    return () => { cancelled = true; observer.disconnect(); };
  }, [id]);
  return <div ref={holder} className="relative h-full w-full">{src ? <img src={src} alt={alt} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-base-850/60 text-slate-600">{failed ? <ImageOff size={22} /> : <Loader2 size={20} className="animate-spin" />}</div>}</div>;
}

function LibraryAudio({ item }: { item: LibraryItem }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { let cancelled = false; void libraryImageUrl(item.id, false).then((url) => !cancelled && setSrc(url)).catch(() => {}); return () => { cancelled = true; }; }, [item.id]);
  return src ? <audio controls src={src} className="h-9 w-full" /> : <Loader2 size={16} className="animate-spin text-slate-500" />;
}

/** Every private cloud item: generated images, uploaded images, speech, and files. */
export function LibraryPage({ onExit }: { onExit: () => void }) {
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const chats = useChatStore((s) => s.chats);
  const [tab, setTab] = useState<LibraryTab>("generated");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<LibraryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");

  const load = useCallback(async (from: string | null) => {
    setLoading(true); setError(null);
    try { const page = await listStorage(from); setItems((previous) => from ? [...previous, ...page.items] : page.items); setCursor(page.cursor); setLoaded(true); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load your library."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (user) void load(null); }, [user, load]);
  useEffect(() => { if (!open) return; const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(null); window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [open]);

  const uploadedImageIds = useMemo(() => new Set(
    chats.flatMap((chat) => chat.messages.flatMap((message) =>
      message.role === "user" ? (message.attachments ?? []).filter((attachment) => attachment.type.startsWith("image/")).map((attachment) => attachment.id) : []
    ))
  ), [chats]);
  const shown = items
    .filter((item) => inTab(item, tab, uploadedImageIds.has(item.id)))
    .filter((item) => !query.trim() || `${item.name ?? ""} ${item.prompt ?? ""} ${item.model ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => order === "newest" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
  const download = async (item: LibraryItem) => {
    if (item.kind === "website") { window.open(item.url, "_blank", "noopener,noreferrer"); return; }
    const url = await libraryImageUrl(item.id, false);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = item.name || `lofin-${item.id}.${extension(item)}`; anchor.click();
  };
  const remove = async (item: LibraryItem) => {
    if (item.kind === "website" || !window.confirm("Delete this item from your cloud library? This can't be undone.")) return;
    setDeleting(true);
    try { await deleteLibraryItem(item.id); setItems((previous) => previous.filter((candidate) => candidate.id !== item.id)); setOpen(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not delete item."); }
    finally { setDeleting(false); }
  };

  return <div className="flex h-dvh w-full flex-col overflow-y-auto bg-base-950">
    <header className="sticky top-0 z-10 border-b border-base-700/60 bg-base-950/90 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3"><button onClick={onExit} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-700/60 hover:text-white" title="Back to Lofin"><ArrowLeft size={17} /></button><LogoMark size={28} /><div className="min-w-0"><h1 className="text-sm font-semibold text-white">Library</h1><p className="truncate text-xs text-slate-500">Private cloud copies, ready whenever you need them</p></div></div>
      {user && <><nav aria-label="Library sections" className="mx-auto mt-3 flex max-w-6xl gap-1 overflow-x-auto">{TABS.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${tab === id ? "bg-accent-500 text-base-950" : "text-slate-400 hover:bg-base-800 hover:text-slate-200"}`}><Icon size={14} />{label}</button>)}</nav><div className="mx-auto mt-3 flex max-w-6xl gap-2"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-base-700/60 bg-base-900/60 px-2.5"><Search size={14} className="text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names, prompts, or models…" className="h-8 min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder-slate-500" /></label><button onClick={() => setOrder((value) => value === "newest" ? "oldest" : "newest")} className="flex items-center gap-1 rounded-lg border border-base-700/60 px-2.5 text-xs text-slate-400 hover:bg-base-800 hover:text-slate-200" title="Change sort order"><SlidersHorizontal size={13} />{order === "newest" ? "Newest" : "Oldest"}</button></div></>}
    </header>
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      {authLoading ? null : !user ? <EmptyLogin onExit={onExit} /> : error && items.length === 0 ? <LoadError error={error} retry={() => load(null)} /> : !loaded ? <div className="flex justify-center py-20 text-slate-500" role="status" aria-label="Loading your library"><Loader2 className="animate-spin" size={22} /></div> : shown.length === 0 ? <EmptyTab tab={tab} /> : <>
        {error && <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
        {(tab === "generated" || tab === "uploaded") ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{shown.map((item) => <button key={item.id} onClick={() => setOpen(item)} className="group relative aspect-square overflow-hidden rounded-xl border border-base-600/60 bg-base-900/60 text-left shadow-panel transition-transform hover:-translate-y-0.5 hover:border-accent-500/50" title={item.prompt || titleFor(item)}><LibraryImage id={item.id} alt={item.prompt || titleFor(item)} /><div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/65 p-2 opacity-0 transition-opacity group-hover:opacity-100"><p className="line-clamp-2 text-xs text-white">{item.prompt || titleFor(item)}</p></div></button>)}</div> : <div className="mx-auto flex max-w-3xl flex-col gap-2">{shown.map((item) => <LibraryRow key={item.id} item={item} onOpen={() => setOpen(item)} />)}</div>}
        {cursor && <div className="mt-6 flex justify-center"><button onClick={() => load(cursor)} disabled={loading} className="rounded-xl border border-base-600 px-4 py-2 text-sm text-slate-200 hover:bg-base-800 disabled:opacity-50">{loading ? "Loading…" : "Load more"}</button></div>}
      </>}
    </main>
    {open && <ItemDialog item={open} deleting={deleting} onClose={() => setOpen(null)} onDownload={() => void download(open)} onDelete={() => void remove(open)} />}
  </div>;
}

function EmptyLogin({ onExit }: { onExit: () => void }) { const signIn = useAuthStore((s) => s.signInWithGoogle); return <div className="flex animate-fade-in-up flex-col items-center gap-3 py-20 text-center"><LogIn size={30} className="animate-float-y text-slate-600" /><p className="text-sm text-slate-400">Sign in to see your saved generations and files.</p><div className="flex flex-wrap justify-center gap-2"><button onClick={() => void signIn()} className="flex items-center gap-1.5 rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-base-950 transition-all hover:bg-accent-400 active:scale-95"><LogIn size={15} />Sign in with Google</button><button onClick={onExit} className="rounded-xl border border-base-600 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-base-800">Back to Lofin</button></div></div>; }
function LoadError({ error, retry }: { error: string; retry: () => void }) { return <div className="flex flex-col items-center gap-3 py-20 text-center"><p className="text-sm text-red-300" role="alert">{error}</p><button onClick={retry} className="rounded-xl border border-base-600 px-4 py-2 text-sm text-slate-200 hover:bg-base-800">Try again</button></div>; }
function EmptyTab({ tab }: { tab: LibraryTab }) { const copy: Record<LibraryTab, string> = { generated: "Generated images from Image mode will appear here automatically.", uploaded: "Images you attach in a chat will appear here.", speech: "Speech you generate will be saved here automatically.", files: "Files you upload and AI-created files will appear here automatically." }; return <div className="flex flex-col items-center gap-3 py-20 text-center"><Images size={34} className="text-slate-600" /><p className="text-sm text-slate-400">Nothing here yet.</p><p className="max-w-xs text-xs text-slate-500">{copy[tab]}</p></div>; }
function LibraryRow({ item, onOpen }: { item: LibraryItem; onOpen: () => void }) { return <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-xl border border-base-700/60 bg-base-900/50 p-3 text-left transition-colors hover:border-accent-500/50 hover:bg-base-850"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-base-800 text-accent-300">{item.kind === "website" ? <FileCode2 size={18} /> : item.category === "speech" || item.type.startsWith("audio/") ? <AudioLines size={18} /> : <File size={18} />}</div><span className="min-w-0 flex-1"><span className="block truncate text-sm text-slate-200">{titleFor(item)}</span><span className="block truncate text-xs text-slate-500">{[item.model, formatDate(item.createdAt)].filter(Boolean).join(" · ")}</span></span><Download size={16} className="shrink-0 text-slate-500" /></button>; }
function ItemDialog({ item, deleting, onClose, onDownload, onDelete }: { item: LibraryItem; deleting: boolean; onClose: () => void; onDownload: () => void; onDelete: () => void }) { useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]); return <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/85 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={titleFor(item)}><div className="flex max-h-full w-full max-w-2xl animate-pop-up flex-col overflow-hidden rounded-2xl border border-base-600/60 bg-base-900 shadow-panel" onClick={(event) => event.stopPropagation()}>{item.type.startsWith("image/") ? <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40"><FullImage id={item.id} alt={titleFor(item)} /></div> : item.category === "speech" || item.type.startsWith("audio/") ? <div className="p-6"><LibraryAudio item={item} /></div> : <div className="flex items-center gap-3 p-6 text-slate-300"><FileCode2 className="text-accent-300" /><span className="truncate">{titleFor(item)}</span></div>}<div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="whitespace-pre-wrap break-words text-sm text-slate-200">{item.prompt || titleFor(item)}</p><p className="mt-1 text-xs text-slate-500">{[item.model, formatDate(item.createdAt)].filter(Boolean).join(" · ")}</p></div><div className="flex shrink-0 items-center gap-2"><button onClick={onDownload} className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-base-950 hover:bg-accent-400"><Download size={15} />{item.kind === "website" ? "Open" : "Download"}</button>{item.kind !== "website" && <button onClick={onDelete} disabled={deleting} className="flex items-center gap-1.5 rounded-lg border border-base-600 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"><Trash2 size={15} />Delete</button>}<button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-700/60 hover:text-white" title="Close" aria-label="Close"><X size={17} /></button></div></div></div></div>; }
function FullImage({ id, alt }: { id: string; alt: string }) { const [src, setSrc] = useState<string | null>(null); useEffect(() => { let cancelled = false; setSrc(null); void libraryImageUrl(id, false).then((url) => !cancelled && setSrc(url)).catch(() => {}); return () => { cancelled = true; }; }, [id]); return src ? <img src={src} alt={alt} className="mx-auto max-h-[70vh] w-auto max-w-full object-contain" /> : <div className="flex h-64 items-center justify-center text-slate-500"><Loader2 className="animate-spin" size={22} /></div>; }
