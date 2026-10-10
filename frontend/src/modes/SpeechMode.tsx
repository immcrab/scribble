import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Send, Loader2, ChevronDown, Search, Crown, Star, Play, Clock, Check, SlidersHorizontal, RotateCcw } from "lucide-react";
import { useChatStore } from "../state/chatStore";
import { ChatMessage } from "../components/ChatMessage";
import { Dropdown } from "../components/Dropdown";
import { Segmented } from "../components/Segmented";
import { SpeechGeneratingLoader } from "../components/SpeechGeneratingLoader";
import {
  generateSpeech,
  listVoices,
  speechFileName,
  speechMimeType,
  audioDurationSeconds,
  SPEECH_FORMATS,
  type Voice,
} from "../lib/speechClient";
import { recordSpeechUsage, mediaUsageGate } from "../lib/usage";
import { beginRecentBySlug, recordMediaUsage, SPEECH_STATS_SLUG } from "../lib/modelStats";
import { auth } from "../lib/firebase";
import { isLocalDev } from "../lib/devMode";
import { useAutoScroll } from "../lib/useAutoScroll";
import { uid } from "../lib/id";
import { useAuthStore } from "../state/authStore";
import type { ChatMessage as ChatMessageType } from "../types";
import type { InitialPrompt } from "../App";

const SUGGESTIONS = [
  "Welcome aboard. Please fasten your seatbelt and enjoy the flight.",
  "Once upon a time, in a village nestled between two mountains, there lived a curious fox.",
  "Your order has shipped and will arrive on Tuesday.",
];

const SPEED_PRESETS = [0.75, 1, 1.25, 1.5, 2];
const SPEED_MIN = 0.5;
const SPEED_MAX = 2;
const MAX_CHARS = 4000;
/** ~150 words a minute at 1× — close enough for a "this will run about N seconds" hint. */
const WORDS_PER_SECOND = 2.5;

const FORMAT_HINTS: Record<string, string> = {
  mp3: "MP3 · small files, plays everywhere",
  wav: "WAV · uncompressed, largest",
  opus: "Opus · efficient, great for voice",
  aac: "AAC · small, Apple-friendly",
  flac: "FLAC · lossless, compressed",
};

/** Simple, transparent pronunciation replacements: one `written => spoken`
 * mapping per line. Kept in the composer because it is specific to the text
 * the user is currently preparing, rather than an opaque voice-model setting. */
function applyPronunciations(text: string, rules: string): string {
  return rules.split("\n").reduce((spoken, rule) => {
    const [written, replacement] = rule.split("=>").map((part) => part?.trim());
    if (!written || !replacement) return spoken;
    return spoken.replaceAll(written, replacement);
  }, text);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** xKiro caches its voice list five minutes upstream; cache the fetch here too so
 * switching Speech chats doesn't refetch 148 rows every time. */
let voicesCache: Promise<Voice[]> | null = null;
function loadVoicesOnce(workerUrl: string, password?: string): Promise<Voice[]> {
  if (!voicesCache) {
    voicesCache = listVoices({ workerUrl, password }).catch((err) => {
      voicesCache = null;
      throw err;
    });
  }
  return voicesCache;
}

type VoiceFilter = "all" | "favorites" | "female" | "male";

const VOICE_FILTERS: { id: VoiceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "favorites", label: "Favorites" },
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
];

function VoiceRow({
  voice,
  active,
  favorite,
  playing,
  loadingPreview,
  onSelect,
  onTogglePreview,
  onToggleFavorite,
}: {
  voice: Voice;
  active: boolean;
  favorite: boolean;
  playing: boolean;
  loadingPreview: boolean;
  onSelect: () => void;
  onTogglePreview: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div className={`group flex items-center ${active ? "row-active bg-accent-500/10" : "hover:bg-base-700/50"}`}>
      <button type="button" onClick={onSelect} aria-current={active ? "true" : undefined} className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-3.5 pr-1 text-left">
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-1.5 text-sm font-medium ${active ? "text-white" : "text-slate-200"}`}>
            <span className="truncate">{voice.name}</span>
            {voice.isVip && <Crown size={11} className="shrink-0 text-amber-400" aria-label="Premium voice" />}
          </span>
          <span className="block truncate text-xs text-slate-500">{[voice.gender, voice.locale].filter(Boolean).join(" · ") || voice.id}</span>
        </span>
        {active && <Check size={13} className="shrink-0 animate-pop-in text-accent-400" aria-label="Selected" />}
      </button>
      <button
        type="button"
        data-no-arrow=""
        onClick={onToggleFavorite}
        aria-pressed={favorite}
        aria-label={favorite ? `Remove ${voice.name} from favorites` : `Add ${voice.name} to favorites`}
        className={`flex h-9 w-8 shrink-0 items-center justify-center ${favorite ? "text-amber-400" : "text-slate-600 hover:text-slate-300 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"}`}
      >
        <Star size={13} fill={favorite ? "currentColor" : "none"} />
      </button>
      <button
        type="button"
        data-no-arrow=""
        onClick={onTogglePreview}
        aria-label={playing ? `Stop ${voice.name} preview` : `Play ${voice.name} preview`}
        title={playing ? "Stop" : "Play a short sample"}
        className={`mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
          playing ? "border-accent-500/60 bg-accent-500/15 text-accent-400" : "border-base-700/70 text-slate-300 hover:border-accent-500/50 hover:text-white"
        }`}
      >
        {loadingPreview ? (
          <Loader2 size={13} className="animate-spin" />
        ) : playing ? (
          <span className="flex items-center gap-1">
            <span className="eq-mini" aria-hidden="true"><span /><span /><span /></span>
          </span>
        ) : (
          <Play size={12} fill="currentColor" />
        )}
      </button>
    </div>
  );
}

function VoicePicker({
  voices,
  selectedId,
  loading,
  favorites,
  recents,
  playingId,
  loadingPreviewId,
  onSelect,
  onToggleFavorite,
  onTogglePreview,
}: {
  voices: Voice[];
  selectedId: string;
  loading: boolean;
  favorites: string[];
  recents: string[];
  playingId: string | null;
  loadingPreviewId: string | null;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onTogglePreview: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<VoiceFilter>("all");
  const selected = voices.find((v) => v.id === selectedId);
  const byId = useMemo(() => new Map(voices.map((v) => [v.id, v])), [voices]);

  const matches = (v: Voice) => {
    const q = query.trim().toLowerCase();
    if (q && !(v.name.toLowerCase().includes(q) || v.id.toLowerCase().includes(q) || (v.locale ?? "").toLowerCase().includes(q) || (v.gender ?? "").toLowerCase().includes(q))) return false;
    if (filter === "favorites") return favorites.includes(v.id);
    if (filter === "female" || filter === "male") return (v.gender ?? "").toLowerCase() === filter;
    return true;
  };
  const browsing = !query.trim() && filter === "all";
  const favVoices = browsing ? favorites.map((id) => byId.get(id)).filter((v): v is Voice => !!v) : [];
  const recentVoices = browsing ? recents.filter((id) => !favorites.includes(id)).map((id) => byId.get(id)).filter((v): v is Voice => !!v) : [];
  const pinned = new Set([...favVoices, ...recentVoices].map((v) => v.id));
  const shown = voices.filter((v) => !pinned.has(v.id) && matches(v));

  return (
    <Dropdown
      align="right"
      label="Choose a voice"
      menuClassName="w-80 max-w-[calc(100vw-2rem)] overflow-hidden"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-sm font-medium text-slate-200 hover:border-base-600 hover:bg-base-800/70"
        >
          <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-500/15 text-[10px] font-semibold uppercase text-accent-400">
            {(selected?.name ?? "?").slice(0, 1)}
          </span>
          {loading ? "Loading voices…" : selected?.name ?? (selectedId || "Pick a voice")}
          <ChevronDown size={14} className={`text-slate-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    >
      {({ close }) => {
        const row = (v: Voice) => (
          <VoiceRow
            key={v.id}
            voice={v}
            active={v.id === selectedId}
            favorite={favorites.includes(v.id)}
            playing={playingId === v.id}
            loadingPreview={loadingPreviewId === v.id}
            onSelect={() => {
              onSelect(v.id);
              close();
            }}
            onTogglePreview={() => onTogglePreview(v.id)}
            onToggleFavorite={() => onToggleFavorite(v.id)}
          />
        );
        return (
          <>
            <div className="sticky top-0 z-10 space-y-2 border-b border-base-700/60 bg-base-850 p-2">
              <label className="relative block">
                <span className="sr-only">Filter voices</span>
                <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  data-autofocus=""
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${voices.length} voices…`}
                  className="w-full rounded-md border border-base-600/60 bg-base-900/60 py-1.5 pl-8 pr-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent-500/50 focus:outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter voices">
                {VOICE_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    data-no-arrow=""
                    aria-pressed={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${
                      filter === f.id ? "border-accent-500/60 bg-accent-500/15 text-white" : "border-base-600/60 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {f.label}
                    {f.id === "favorites" && favorites.length > 0 && <span className="ml-1 text-slate-500">{favorites.length}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="menu-cascade max-h-80 overflow-y-auto">
              {favVoices.length > 0 && (
                <div role="group" aria-label="Favorites" className="border-b border-base-700/40 py-1">
                  <div className="flex items-center gap-1.5 px-3.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <Star size={11} className="text-amber-400" fill="currentColor" /> Favorites
                  </div>
                  {favVoices.map(row)}
                </div>
              )}
              {recentVoices.length > 0 && (
                <div role="group" aria-label="Recent" className="border-b border-base-700/40 py-1">
                  <div className="flex items-center gap-1.5 px-3.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <Clock size={11} /> Recent
                  </div>
                  {recentVoices.map(row)}
                </div>
              )}
              {shown.length === 0 && favVoices.length === 0 && recentVoices.length === 0 ? (
                <p className="px-3.5 py-3 text-xs text-slate-500" role="status">
                  {filter === "favorites" ? "Star a voice to keep it here." : `No voices match${query.trim() ? ` “${query.trim()}”` : ""}.`}
                </p>
              ) : (
                shown.length > 0 && (
                  <div role="group" aria-label="All voices" className="py-1">
                    {browsing && (favVoices.length > 0 || recentVoices.length > 0) && (
                      <div className="px-3.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">All voices</div>
                    )}
                    {shown.map(row)}
                  </div>
                )
              )}
            </div>
          </>
        );
      }}
    </Dropdown>
  );
}

/** Circular character counter — fills as the text approaches the limit. */
function CharRing({ count, max }: { count: number; max: number }) {
  const r = 10;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, count / max);
  const tone = pct >= 1 ? "text-red-400" : pct > 0.9 ? "text-amber-400" : "text-accent-400";
  return (
    <span className="relative inline-flex h-7 w-7 items-center justify-center" title={`${count.toLocaleString()} / ${max.toLocaleString()} characters`}>
      <svg width="28" height="28" viewBox="0 0 28 28" className="-rotate-90" aria-hidden="true">
        <circle cx="14" cy="14" r={r} fill="none" strokeWidth="2.5" className="stroke-base-700" />
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={`${tone} stroke-current transition-[stroke-dashoffset] duration-300 ease-out-expo`}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span className="sr-only">{count} of {max} characters</span>
    </span>
  );
}

export function SpeechMode({
  chatId,
  initialPrompt,
  onConsumeInitial,
}: {
  chatId: string;
  initialPrompt?: InitialPrompt;
  onConsumeInitial?: () => void;
}) {
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const settings = useChatStore((s) => s.settings);
  const { addMessage, updateMessage, maybeAutoTitle, updateSettings } = useChatStore();
  const [prompt, setPrompt] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 640px)").matches);
  const previewAudio = useRef<HTMLAudioElement | null>(null);
  const previewCache = useRef(new Map<string, string>());
  const chatEndRef = useAutoScroll<HTMLDivElement>(chat?.messages ?? []);
  const sendRef = useRef<(text: string) => void>(() => {});

  const format = settings.speechFormat ?? "mp3";
  const speed = settings.speechSpeed ?? 1;
  const favorites = settings.speechFavoriteVoices ?? [];
  const recents = settings.speechRecentVoices ?? [];
  const pronunciations = settings.speechPronunciations ?? "";
  const selectedVoiceId = settings.speechVoiceId ?? voices[0]?.id ?? "";

  useEffect(() => {
    let cancelled = false;
    setVoicesLoading(true);
    loadVoicesOnce(settings.workerUrl, settings.password)
      .then((list) => {
        if (cancelled) return;
        setVoices(list);
        setVoicesError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setVoicesError(err instanceof Error ? err.message : "Couldn't load the voice list.");
      })
      .finally(() => {
        if (!cancelled) setVoicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [settings.workerUrl, settings.password]);

  const stopPreview = () => {
    previewAudio.current?.pause();
    previewAudio.current = null;
    setPlayingId(null);
  };
  // Silence any sample still playing when the user leaves Speech mode.
  useEffect(() => stopPreview, []);

  const generating = chat?.messages.some((m) => m.streaming) ?? false;

  const rememberVoice = (id: string) => {
    const next = [id, ...recents.filter((r) => r !== id)].slice(0, 5);
    updateSettings({ speechRecentVoices: next });
  };

  const selectVoice = (id: string) => {
    updateSettings({ speechVoiceId: id });
    rememberVoice(id);
  };

  const toggleFavorite = (id: string) => {
    updateSettings({ speechFavoriteVoices: favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id] });
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || generating || !chat) return;
    const voice = settings.speechVoiceId ?? voices[0]?.id;
    if (!voice) {
      setVoicesError("No voice selected yet — wait for the voice list to load.");
      return;
    }
    stopPreview();
    setPrompt("");

    const userMsg: ChatMessageType = { id: uid(), role: "user", content: trimmed, createdAt: Date.now() };
    addMessage(chat.id, userMsg);
    maybeAutoTitle(chat.id, trimmed);

    const assistantMsg: ChatMessageType = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      streaming: true,
      thinkingStartedAt: Date.now(),
    };
    addMessage(chat.id, assistantMsg);

    if (!useAuthStore.getState().user && !isLocalDev()) {
      updateMessage(chat.id, assistantMsg.id, { streaming: false, error: "Sign in to generate speech." });
      return;
    }

    const gate = mediaUsageGate("speech");
    if (!gate.ok) {
      updateMessage(chat.id, assistantMsg.id, { streaming: false, error: gate.reason });
      return;
    }

    const statsRequest = beginRecentBySlug(SPEECH_STATS_SLUG, "speech", "speech");
    try {
      const spokenText = applyPronunciations(trimmed, pronunciations);
      const dataUrl = await generateSpeech({
        workerUrl: settings.workerUrl,
        password: settings.password,
        input: spokenText,
        voice,
        format,
        speed,
      });
      const words = spokenText.split(/\s+/).filter(Boolean).length;
      recordSpeechUsage(words, await audioDurationSeconds(dataUrl));
      recordMediaUsage("speech", SPEECH_STATS_SLUG, statsRequest);
      rememberVoice(voice);
      updateMessage(chat.id, assistantMsg.id, {
        streaming: false,
        attachments: [
          {
            id: uid(),
            name: speechFileName(format),
            type: speechMimeType(format),
            dataUrl,
            size: dataUrl.length,
            library: { category: "speech", prompt: trimmed, model: voice },
          },
        ],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Speech generation failed.";
      updateMessage(chat.id, assistantMsg.id, { streaming: false, error: message });
    }
  };

  /** Plays (or stops) a 2-second sample of a voice. Samples are cached per voice for the session. */
  const togglePreview = async (voice: string) => {
    if (playingId === voice) {
      stopPreview();
      return;
    }
    if (loadingPreviewId) return;
    stopPreview();
    setLoadingPreviewId(voice);
    try {
      let url = previewCache.current.get(voice);
      if (!url) {
        url = await generateSpeech({ workerUrl: settings.workerUrl, password: settings.password, input: "Hello. This is a short preview of my voice.", voice, format: "mp3", speed: 1 });
        previewCache.current.set(voice, url);
      }
      const audio = new Audio(url);
      audio.onended = () => {
        if (previewAudio.current === audio) {
          previewAudio.current = null;
          setPlayingId(null);
        }
      };
      previewAudio.current = audio;
      await audio.play();
      setPlayingId(voice);
    } catch (err) {
      previewAudio.current = null;
      setVoicesError(err instanceof Error ? err.message : "Couldn't generate a voice preview.");
    } finally {
      setLoadingPreviewId(null);
    }
  };
  sendRef.current = send;

  useEffect(() => {
    if (initialPrompt && chat && chat.messages.length === 0) {
      sendRef.current(initialPrompt.prompt);
      onConsumeInitial?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  if (!chat) return null;

  const words = prompt.split(/\s+/).filter(Boolean).length;
  const estimate = words > 0 ? formatDuration(words / (WORDS_PER_SECOND * speed)) : null;
  const customized = speed !== 1 || format !== "mp3" || !!pronunciations.trim();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-base-700/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <AudioLines size={15} className="text-accent-400" />
          <span className="text-sm font-medium text-slate-200">Text to speech</span>
        </div>
        <div className="flex items-center gap-1">
          <VoicePicker
            voices={voices}
            selectedId={selectedVoiceId}
            loading={voicesLoading}
            favorites={favorites}
            recents={recents}
            playingId={playingId}
            loadingPreviewId={loadingPreviewId}
            onSelect={selectVoice}
            onToggleFavorite={toggleFavorite}
            onTogglePreview={togglePreview}
          />
          <button
            type="button"
            onClick={() => setOptionsOpen((o) => !o)}
            aria-expanded={optionsOpen}
            aria-controls="speech-options"
            title="Voice options"
            className={`relative flex h-8 w-8 items-center justify-center rounded-lg border ${
              optionsOpen ? "border-accent-500/50 bg-accent-500/10 text-accent-400" : "border-transparent text-slate-400 hover:border-base-600 hover:bg-base-800/70 hover:text-slate-200"
            }`}
          >
            <SlidersHorizontal size={15} />
            {customized && <span aria-hidden="true" className="absolute right-1 top-1 h-1.5 w-1.5 animate-pop-in rounded-full bg-accent-400" />}
            <span className="sr-only">Voice options</span>
          </button>
        </div>
      </div>

      {chat.messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
          <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent-400/40 bg-base-850 text-accent-400 shadow-panel">
            <AudioLines size={22} />
          </span>
          <h1 className="animate-fade-in-up font-serif text-3xl font-light tracking-tighter text-slate-100 sm:text-4xl">
            What should we say?
          </h1>
          <div className="stagger flex max-w-2xl flex-col gap-2 sm:flex-row">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="hover-lift flex-1 rounded-xl border border-base-700/60 bg-base-850/60 p-3 text-left text-xs text-slate-400 hover:border-accent-500/50 hover:text-slate-200"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-8" ref={chatEndRef}>
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {chat.messages.map((m) =>
              m.role === "assistant" && m.streaming && !m.error ? (
                <div key={m.id} className="flex animate-fade-in-up gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-accent-500/60 bg-base-900/90">
                    <AudioLines size={14} className="text-accent-400" />
                  </div>
                  <SpeechGeneratingLoader startedAt={m.thinkingStartedAt} />
                </div>
              ) : (
                <ChatMessage key={m.id} message={m} />
              )
            )}
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-8">
        {voicesError && <p className="mb-2 animate-fade-in-up px-1 text-xs text-red-400" role="alert">{voicesError}</p>}

        <div
          id="speech-options"
          aria-hidden={!optionsOpen}
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out-expo ${optionsOpen ? "mb-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
        >
          <div className={`overflow-hidden ${optionsOpen ? "visible" : "invisible [transition:visibility_0s_linear_300ms]"}`}>
            <div className="opt-panel space-y-4 p-3.5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="opt-label">Speed</span>
                  <span className="text-sm font-medium tabular-nums text-slate-200">{speed.toFixed(2).replace(/0$/, "")}×</span>
                </div>
                <input
                  type="range"
                  min={SPEED_MIN}
                  max={SPEED_MAX}
                  step={0.05}
                  value={speed}
                  onChange={(e) => updateSettings({ speechSpeed: Math.round(Number(e.target.value) * 100) / 100 })}
                  aria-label="Speech speed"
                  className="range-lofin mt-1"
                />
                <div className="mt-1 flex items-center justify-between gap-2">
                  <Segmented
                    ariaLabel="Speed presets"
                    value={SPEED_PRESETS.includes(speed) ? speed : -1}
                    onChange={(v) => updateSettings({ speechSpeed: v })}
                    options={SPEED_PRESETS.map((s) => ({ value: s, label: `${s}×` }))}
                  />
                  {speed !== 1 && (
                    <button type="button" onClick={() => updateSettings({ speechSpeed: 1 })} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300">
                      <RotateCcw size={11} /> Reset
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="opt-label">Format</span>
                  <p className="mt-0.5 text-[11px] text-slate-500">{FORMAT_HINTS[format] ?? format}</p>
                </div>
                <Segmented
                  ariaLabel="Audio format"
                  value={format}
                  onChange={(f) => updateSettings({ speechFormat: f })}
                  options={SPEECH_FORMATS.map((f) => ({ value: f as string, label: f.toUpperCase(), title: FORMAT_HINTS[f] }))}
                />
              </div>

              <label className="block">
                <span className="opt-label">Pronunciation</span>
                <textarea
                  value={pronunciations}
                  onChange={(event) => updateSettings({ speechPronunciations: event.target.value })}
                  rows={2}
                  placeholder={"One per line, for example:\nLofin => low-fin"}
                  className="mt-1.5 w-full resize-y rounded-lg border border-base-700/70 bg-base-900/60 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-accent-500/60"
                />
                <span className="mt-1 block text-[11px] text-slate-500">Only the generated audio uses these replacements; your original text stays unchanged.</span>
              </label>
            </div>
          </div>
        </div>

        <div className="image-composer flex items-end gap-2 rounded-2xl border border-base-600/60 bg-base-850/70 p-2 shadow-panel">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send(prompt);
              }
            }}
            rows={2}
            placeholder="Type or paste the text to speak…  (⌘/Ctrl+Enter to generate)"
            className="min-h-[2.5rem] min-w-0 flex-1 resize-y bg-transparent px-2 py-2 text-sm text-white outline-none placeholder-slate-500"
          />
          <div className="flex flex-col items-center gap-1">
            <CharRing count={prompt.length} max={MAX_CHARS} />
            <button
              onClick={() => send(prompt)}
              disabled={!prompt.trim() || generating}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-base-950 hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40"
              title="Generate speech"
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
        <p className="mt-1.5 px-1 text-[11px] tabular-nums text-slate-500">
          {estimate ? `${words.toLocaleString()} words · about ${estimate} at ${speed}×` : "Tip: speed and format live under Voice options."}
        </p>
      </div>
    </div>
  );
}
