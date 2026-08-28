import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Send, Loader2, ChevronDown, Search, Crown } from "lucide-react";
import { useChatStore } from "../state/chatStore";
import { ChatMessage } from "../components/ChatMessage";
import { Dropdown } from "../components/Dropdown";
import { SpeechGeneratingLoader } from "../components/SpeechGeneratingLoader";
import {
  generateSpeech,
  listVoices,
  speechFileName,
  speechMimeType,
  SPEECH_FORMATS,
  type Voice,
} from "../lib/speechClient";
import { auth } from "../lib/firebase";
import { useAutoScroll } from "../lib/useAutoScroll";
import { uid } from "../lib/id";
import type { ChatMessage as ChatMessageType } from "../types";
import type { InitialPrompt } from "../App";

const SUGGESTIONS = [
  "Welcome aboard. Please fasten your seatbelt and enjoy the flight.",
  "Once upon a time, in a village nestled between two mountains, there lived a curious fox.",
  "Your order has shipped and will arrive on Tuesday.",
];

const SPEEDS = [0.75, 1, 1.25, 1.5];
const MAX_CHARS = 4000;

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

function VoicePicker({
  voices,
  selectedId,
  loading,
  onSelect,
}: {
  voices: Voice[];
  selectedId: string;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const selected = voices.find((v) => v.id === selectedId);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return voices;
    return voices.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.id.toLowerCase().includes(q) ||
        (v.locale ?? "").toLowerCase().includes(q) ||
        (v.gender ?? "").toLowerCase().includes(q)
    );
  }, [voices, filter]);

  return (
    <Dropdown
      align="right"
      menuClassName="w-72 max-w-[calc(100vw-2rem)] overflow-hidden"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          className="flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:border-base-600 hover:bg-base-800/70"
        >
          {loading ? "Loading voices…" : selected?.name ?? (selectedId || "Pick a voice")}
          <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="sticky top-0 flex items-center gap-2 border-b border-base-700/60 bg-base-850/95 px-3 py-2">
            <Search size={13} className="shrink-0 text-slate-500" />
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Filter ${voices.length} voices…`}
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder-slate-500"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {shown.length === 0 ? (
              <p className="px-3.5 py-3 text-xs text-slate-500">No voices match “{filter}”.</p>
            ) : (
              shown.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    onSelect(v.id);
                    close();
                  }}
                  className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors ${
                    v.id === selectedId ? "bg-accent-500/10" : "hover:bg-base-700/50"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={`flex items-center gap-1.5 text-sm font-medium ${
                        v.id === selectedId ? "text-white" : "text-slate-200"
                      }`}
                    >
                      <span className="truncate">{v.name}</span>
                      {v.isVip && <Crown size={11} className="shrink-0 text-amber-400" />}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {[v.gender, v.locale].filter(Boolean).join(" · ") || v.id}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </Dropdown>
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
  const chatEndRef = useAutoScroll<HTMLDivElement>(chat?.messages ?? []);
  const sendRef = useRef<(text: string) => void>(() => {});

  const format = settings.speechFormat ?? "mp3";
  const speed = settings.speechSpeed ?? 1;
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

  const generating = chat?.messages.some((m) => m.streaming) ?? false;

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || generating || !chat) return;
    const voice = settings.speechVoiceId ?? voices[0]?.id;
    if (!voice) {
      setVoicesError("No voice selected yet — wait for the voice list to load.");
      return;
    }
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

    if (!auth.currentUser) {
      updateMessage(chat.id, assistantMsg.id, { streaming: false, error: "Sign in to generate speech." });
      return;
    }

    try {
      const dataUrl = await generateSpeech({
        workerUrl: settings.workerUrl,
        password: settings.password,
        input: trimmed,
        voice,
        format,
        speed,
      });
      updateMessage(chat.id, assistantMsg.id, {
        streaming: false,
        attachments: [
          {
            id: uid(),
            name: speechFileName(format),
            type: speechMimeType(format),
            dataUrl,
            size: dataUrl.length,
          },
        ],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Speech generation failed.";
      updateMessage(chat.id, assistantMsg.id, { streaming: false, error: message });
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-base-700/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <AudioLines size={15} className="text-accent-400" />
          <span className="text-sm font-medium text-slate-200">Text to speech</span>
        </div>
        <VoicePicker
          voices={voices}
          selectedId={selectedVoiceId}
          loading={voicesLoading}
          onSelect={(id) => updateSettings({ speechVoiceId: id })}
        />
      </div>

      {chat.messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
          <h1 className="font-serif text-3xl font-light tracking-tighter text-slate-100 sm:text-4xl">
            What should we say?
          </h1>
          <div className="flex max-w-2xl flex-col gap-2 sm:flex-row">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="flex-1 rounded-xl border border-base-700/60 bg-base-850/50 p-3 text-left text-xs text-slate-400 transition-all hover:-translate-y-0.5 hover:border-accent-500/50 hover:text-slate-200"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8" ref={chatEndRef}>
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {chat.messages.map((m) =>
              m.role === "assistant" && m.streaming && !m.error ? (
                <div key={m.id} className="flex animate-fade-in-up gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-accent-500/60 bg-base-900/90 shadow-glow">
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
        {voicesError && <p className="mb-2 px-1 text-xs text-red-400">{voicesError}</p>}

        <div className="mb-2 flex flex-wrap items-center gap-2 px-0.5 text-xs text-slate-400">
          <span className="text-slate-500">Speed</span>
          <div className="flex overflow-hidden rounded-lg border border-base-700/60">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => updateSettings({ speechSpeed: s })}
                className={`px-2 py-1 transition-colors ${
                  s === speed ? "bg-accent-500 text-base-950" : "text-slate-300 hover:bg-base-800/70"
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
          <span className="ml-1 text-slate-500">Format</span>
          <div className="flex overflow-hidden rounded-lg border border-base-700/60">
            {SPEECH_FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => updateSettings({ speechFormat: f })}
                className={`px-2 py-1 uppercase transition-colors ${
                  f === format ? "bg-accent-500 text-base-950" : "text-slate-300 hover:bg-base-800/70"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-2 rounded-2xl border border-base-600/60 bg-base-850/70 p-2 shadow-panel">
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
            <span className="text-[10px] tabular-nums text-slate-500">
              {prompt.length}/{MAX_CHARS}
            </span>
            <button
              onClick={() => send(prompt)}
              disabled={!prompt.trim() || generating}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-base-950 transition-colors hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40"
              title="Generate speech"
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
