import { useEffect, useState } from "react";
import { Bell, BellOff, ExternalLink, X } from "lucide-react";
import { useCatalogStore } from "../lib/catalogSync";
import { useChatStore } from "../state/chatStore";
import type { Announcement } from "../types";

const SEEN_KEY = "scribble:seen-announcements";

function readSeen(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; }
}
function markSeen(id: string) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...readSeen(), id])].slice(-100))); } catch { /* private mode */ }
}

function AnnouncementCard({ item, onClose }: { item: Announcement; onClose?: () => void }) {
  return <article className="overflow-hidden rounded-2xl border border-base-600/60 bg-base-900/85 shadow-panel">
    {item.imageUrl && <img src={item.imageUrl} alt="" className="h-44 w-full object-cover" />}
    <div className="p-5">
      <div className="mb-2 flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-accent-500/15 p-2 text-accent-300"><Bell size={16} /></div>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-400">New in Scribble</p><h2 className="mt-1 text-lg font-semibold text-white">{item.title}</h2></div>
        {onClose && <button onClick={onClose} aria-label="Close announcement" className="rounded-lg p-1 text-slate-500 hover:bg-base-700 hover:text-white"><X size={18} /></button>}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-400">{item.body}</p>
      {item.ctaUrl && <a href={item.ctaUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-base-950 hover:bg-accent-400">{item.ctaLabel || "Learn more"}<ExternalLink size={14} /></a>}
    </div>
  </article>;
}

export function AnnouncementLaunch() {
  const announcements = useCatalogStore((s) => s.catalog.announcements ?? []);
  const settings = useChatStore((s) => s.settings);
  const updateSettings = useChatStore((s) => s.updateSettings);
  const enabled = settings.announcementsEnabled;
  const [current, setCurrent] = useState<Announcement | null>(null);
  useEffect(() => {
    if (!enabled) return setCurrent(null);
    // Keep the card mounted after recording it as seen. The settings update below
    // triggers this effect again, so without this guard the card would immediately
    // dismiss itself on the next render.
    if (current) return;
    const seen = new Set([...readSeen(), ...(settings.seenAnnouncementIds ?? [])]);
    const next = announcements.find((item) => !seen.has(item.id)) ?? null;
    // “Seen” means the card was presented, not merely that its close button was
    // pressed. Otherwise a reload while it is on screen causes the exact same
    // release note to repeat indefinitely.
    if (next) {
      markSeen(next.id);
      const ids = [...new Set([...(settings.seenAnnouncementIds ?? []), next.id])].slice(-100);
      updateSettings({ seenAnnouncementIds: ids });
    }
    setCurrent(next);
  }, [announcements, enabled, settings.seenAnnouncementIds, updateSettings, current]);
  if (!current) return null;
  const close = () => { markSeen(current.id); setCurrent(null); };
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md animate-fade-in" role="dialog" aria-modal="true" aria-label="New announcement">
    <div className="w-full max-w-xl animate-fade-in-up"><AnnouncementCard item={current} onClose={close} /><button onClick={close} className="mx-auto mt-3 block text-sm text-slate-400 hover:text-white">Maybe later</button></div>
  </div>;
}

export function AnnouncementCenter({ onClose }: { onClose: () => void }) {
  const announcements = useCatalogStore((s) => s.catalog.announcements ?? []);
  const { settings, updateSettings } = useChatStore();
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
    <div onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-base-600/60 bg-base-850 shadow-panel animate-fade-in-up">
      <header className="flex items-center gap-3 border-b border-base-700/60 px-5 py-4"><div className="rounded-xl bg-accent-500/15 p-2 text-accent-300"><Bell size={18} /></div><div className="flex-1"><h1 className="font-semibold text-white">Announcements</h1><p className="text-xs text-slate-500">What’s new in Scribble</p></div><button onClick={() => updateSettings({ announcementsEnabled: !settings.announcementsEnabled })} className="flex items-center gap-1.5 rounded-lg border border-base-600/60 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white">{settings.announcementsEnabled ? <Bell size={13} /> : <BellOff size={13} />}{settings.announcementsEnabled ? "On" : "Off"}</button><button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-base-700 hover:text-white"><X size={18} /></button></header>
      <div className="space-y-4 overflow-y-auto p-5">{announcements.length ? announcements.map((item) => <AnnouncementCard key={item.id} item={item} />) : <p className="py-10 text-center text-sm text-slate-500">No announcements yet.</p>}</div>
    </div>
  </div>;
}
