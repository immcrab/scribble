import { useState } from "react";
import { ChevronDown, ExternalLink, Play, Youtube } from "lucide-react";
import type { ToolCallRecord, YouTubeVideo } from "../types";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const thumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

function Thumb({ id, className }: { id: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={`flex items-center justify-center bg-base-800 text-slate-600 ${className}`}>
        <Youtube size={18} />
      </span>
    );
  }
  return <img src={thumbnail(id)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`object-cover ${className}`} />;
}

/** A small YouTube window inside the chat: one player on top (loaded only once the user
 * presses play, so no YouTube scripts or cookies are fetched for a list nobody watches)
 * and the other found / related videos underneath. Playback is the privacy-enhanced
 * youtube-nocookie embed. */
export function YouTubeResults({ toolCall }: { toolCall: ToolCallRecord }) {
  const videos = (toolCall.videos ?? []).filter((v) => VIDEO_ID_RE.test(v.id));
  const [open, setOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>(videos[0]?.id);
  const [playing, setPlaying] = useState(false);
  if (!videos.length) return null;

  const selected: YouTubeVideo = videos.find((v) => v.id === selectedId) ?? videos[0];
  const query = typeof toolCall.input?.query === "string" ? toolCall.input.query : "";
  const select = (id: string) => {
    setSelectedId(id);
    setPlaying(true);
  };

  return (
    <section className="mb-3 max-w-xl overflow-hidden rounded-2xl border border-base-700/60 bg-base-900/70 shadow-lg" aria-label="YouTube videos">
      <div className="flex items-center gap-2 border-b border-base-700/60 px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-400">
          <Youtube size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white">YouTube</p>
          {query && <p className="truncate text-[11px] text-slate-500">{query}</p>}
        </div>
        <a
          href={watchUrl(selected.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-base-700/60 hover:text-white"
        >
          Open <ExternalLink size={12} />
        </a>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? "Collapse YouTube videos" : "Expand YouTube videos"}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-base-700 hover:text-white"
        >
          <ChevronDown size={14} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
      </div>

      {open && (
        <>
          <div className="bg-black p-0">
            <div className="relative aspect-video w-full">
              {playing ? (
                <iframe
                  key={selected.id}
                  src={`https://www.youtube-nocookie.com/embed/${selected.id}?autoplay=1&rel=0`}
                  title={selected.title}
                  className="absolute inset-0 h-full w-full border-0"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  aria-label={`Play ${selected.title}`}
                  className="group absolute inset-0 block h-full w-full"
                >
                  <Thumb id={selected.id} className="h-full w-full" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/10">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-transform group-hover:scale-105">
                      <Play size={20} fill="currentColor" className="ml-0.5" />
                    </span>
                  </span>
                </button>
              )}
            </div>
            <div className="bg-base-900 px-3 py-2">
              <p className="line-clamp-2 text-sm font-medium text-white">{selected.title}</p>
              <VideoMeta video={selected} />
            </div>
          </div>

          {videos.length > 1 && (
            <ul className="max-h-60 space-y-0.5 overflow-y-auto border-t border-base-700/60 p-1.5">
              {videos.map((video) => {
                const active = video.id === selected.id;
                return (
                  <li key={video.id}>
                    <button
                      type="button"
                      onClick={() => select(video.id)}
                      aria-current={active}
                      className={`flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors ${active ? "bg-base-700/60" : "hover:bg-base-800"}`}
                    >
                      <span className="relative h-[3.25rem] w-24 shrink-0 overflow-hidden rounded-md bg-base-800">
                        <Thumb id={video.id} className="h-full w-full" />
                        {video.duration && (
                          <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 text-[10px] font-medium leading-4 text-white">{video.duration}</span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`line-clamp-2 text-xs font-medium ${active ? "text-white" : "text-slate-200"}`}>{video.title}</span>
                        <VideoMeta video={video} compact />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function VideoMeta({ video, compact }: { video: YouTubeVideo; compact?: boolean }) {
  const parts = [video.channel, compact ? undefined : video.duration, video.views, video.published].filter(Boolean);
  if (!parts.length) return null;
  return <span className="mt-0.5 block truncate text-[11px] text-slate-500">{parts.join(" · ")}</span>;
}
