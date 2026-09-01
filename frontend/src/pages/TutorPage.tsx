/**
 * `/tutor` — a tutor that learns how *you* write.
 *
 * Three things happen on this page:
 *   1. You give it your own work — typed, dropped in as a text file, or photographed
 *      (a vision model transcribes those). It all stays in this browser's localStorage;
 *      none of it is uploaded or cloud-synced (see lib/tutorStore.ts).
 *   2. It analyses that corpus into a style profile — how you open, how long your
 *      sentences run, what punctuation you reach for, what would read as not-you.
 *   3. Every conversation turn then rides on that profile, with the model chosen
 *      automatically for the turn: vision for photos, a reasoning model for maths,
 *      a coding model for code, the best prose model for writing (lib/tutorRouter.ts).
 *
 * Maths is rendered as real LaTeX — the models are told to emit it, and Markdown is
 * mounted here with `math` on (see lib/markdown.tsx).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BrainCog,
  Check,
  ChevronDown,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Loader2,
  PenLine,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  TriangleAlert,
  User,
  Wand2,
  X,
} from "lucide-react";
import { Composer } from "../components/Composer";
import { Dropdown } from "../components/Dropdown";
import { LogoMark } from "../components/Logo";
import { ModelFavicon } from "../components/ProviderIcon";
import { Markdown } from "../lib/markdown";
import { uid } from "../lib/id";
import { fileToPreparedDataUrl } from "../lib/imagePrep";
import { getAllModels } from "../config/models";
import { analyzeSamples, transcribeImageSample } from "../lib/tutorAnalysis";
import { runTutorTurn } from "../lib/tutorClient";
import { routeTutorTurn } from "../lib/tutorRouter";
import {
  MIN_ANALYSIS_WORDS,
  sampleWordCount,
  useTutorStore,
  type StyleProfile,
  type TutorMessage,
  type WritingSample,
} from "../lib/tutorStore";
import type { Attachment, ModelDef } from "../types";

/** Cap on a pasted or uploaded text sample — enough for a long essay, short of a novel. */
const MAX_SAMPLE_CHARS = 40000;
/** Widest edge kept for an attachment that gets persisted alongside the conversation. */
const ATTACHMENT_PREVIEW_PX = 1024;
/** Widest edge kept for a writing sample's thumbnail — it's decoration, not data. */
const SAMPLE_THUMB_PX = 512;

const isImageAttachment = (a: Attachment) => a.type?.startsWith("image/") || a.dataUrl?.startsWith("data:image/");

/** Re-encodes a data URL at a smaller size, so localStorage isn't asked to hold full-size photos. */
function shrinkDataUrl(dataUrl: string, maxEdge: number, quality = 0.72): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onerror = () => resolve(dataUrl);
    image.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
      if (scale === 1 && dataUrl.length < 200_000) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.src = dataUrl;
  });
}

function words(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function SourceIcon({ source }: { source: WritingSample["source"] }) {
  if (source === "image") return <ImageIcon size={13} className="text-accent-400" />;
  if (source === "file") return <FileText size={13} className="text-accent-400" />;
  return <PenLine size={13} className="text-accent-400" />;
}

/** The paste-a-sample form. Collapsed to a button until the user actually wants it. */
function AddSampleForm({ onAdd, onCancel }: { onAdd: (title: string, text: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const count = words(text);

  return (
    <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What is this? (e.g. History essay, blog post)"
        className="mb-2 w-full rounded-lg border border-base-700/60 bg-base-950/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-accent-500/60"
      />
      <textarea
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value.slice(0, MAX_SAMPLE_CHARS))}
        placeholder="Paste something you wrote…"
        rows={7}
        className="w-full resize-y rounded-lg border border-base-700/60 bg-base-950/60 px-3 py-2 text-sm leading-relaxed text-slate-200 placeholder-slate-600 outline-none focus:border-accent-500/60"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-500">{count} words</span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-base-600/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-base-500 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={() => onAdd(title.trim() || "Untitled sample", text)}
            disabled={count === 0}
            className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-base-950 hover:bg-accent-400 disabled:cursor-not-allowed disabled:bg-base-600 disabled:text-slate-500"
          >
            Add sample
          </button>
        </div>
      </div>
    </div>
  );
}

function SampleCard({ sample, onRemove }: { sample: WritingSample; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="group rounded-xl border border-base-700/60 bg-base-900/40 p-3">
      <div className="flex items-start gap-2.5">
        {sample.imageDataUrl && (
          <img
            src={sample.imageDataUrl}
            alt={sample.title}
            className="h-12 w-12 shrink-0 rounded-lg border border-base-700/60 object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <SourceIcon source={sample.source} />
            <span className="truncate text-sm font-medium text-slate-200">{sample.title}</span>
          </div>
          {sample.transcribing ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 size={11} className="animate-spin" /> Reading the image…
            </p>
          ) : sample.error ? (
            <p className="mt-1 text-xs text-red-400">{sample.error}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">{words(sample.text)} words</p>
          )}
        </div>
        <button
          onClick={onRemove}
          title="Remove sample"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 opacity-0 transition-opacity hover:bg-base-700/60 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </div>
      {sample.text && (
        <>
          <p className={`mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-400 ${open ? "" : "line-clamp-3"}`}>
            {sample.text}
          </p>
          <button onClick={() => setOpen((o) => !o)} className="mt-1 text-[11px] text-slate-500 hover:text-slate-300">
            {open ? "Show less" : "Show more"}
          </button>
        </>
      )}
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <span key={t} className="rounded-full bg-base-800/80 px-2 py-0.5 text-[11px] text-slate-300">
          {t}
        </span>
      ))}
    </div>
  );
}

function ProfileCard({ profile, stale }: { profile: StyleProfile; stale: boolean }) {
  const rows: [string, string][] = [
    ["Sentence rhythm", profile.sentenceRhythm],
    ["Vocabulary", profile.vocabulary],
    ["Structure", profile.structure],
    ["Punctuation", profile.punctuation],
  ];
  return (
    <div className="rounded-xl border border-accent-500/30 bg-accent-500/5 p-4">
      <div className="flex items-center gap-1.5">
        <Sparkles size={13} className="text-accent-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-400">Your writing profile</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-200">{profile.summary}</p>
      {profile.tone.length > 0 && (
        <div className="mt-3">
          <Chips items={profile.tone} />
        </div>
      )}
      <dl className="mt-3 space-y-2">
        {rows
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="text-xs leading-relaxed text-slate-300">{value}</dd>
            </div>
          ))}
      </dl>
      {profile.quirks.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Habits it will reproduce</p>
          <ul className="mt-1 space-y-1">
            {profile.quirks.map((q) => (
              <li key={q} className="flex gap-1.5 text-xs leading-relaxed text-slate-300">
                <Check size={12} className="mt-0.5 shrink-0 text-accent-400" />
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {profile.avoid.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Would read as not-you</p>
          <ul className="mt-1 space-y-1">
            {profile.avoid.map((q) => (
              <li key={q} className="flex gap-1.5 text-xs leading-relaxed text-slate-400">
                <X size={12} className="mt-0.5 shrink-0 text-red-400/80" />
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 border-t border-accent-500/20 pt-2 text-[11px] text-slate-500">
        Built from {profile.wordCount.toLocaleString()} words by {profile.modelDisplayName} ·{" "}
        {new Date(profile.createdAt).toLocaleDateString()}
      </p>
      {stale && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-300">
          <TriangleAlert size={12} className="mt-0.5 shrink-0" />
          Your samples changed since this was built. Re-analyze to bring it up to date.
        </p>
      )}
    </div>
  );
}

/** One conversation bubble. Assistant replies carry the model that answered and why. */
function MessageBubble({ message, onRetry }: { message: TutorMessage; onRetry?: () => void }) {
  const isUser = message.role === "user";
  return (
    <div className={`animate-fade-in-up flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          isUser ? "bg-base-700 text-slate-300" : "border border-base-700/60 bg-base-900/90"
        }`}
      >
        {isUser ? <User size={14} /> : message.model ? <ModelFavicon model={message.model} size={15} /> : <GraduationCap size={14} className="text-slate-400" />}
      </div>
      <div className={`flex min-w-0 flex-1 flex-col ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && message.routeReason && (
          <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] text-slate-500">
            <Wand2 size={11} className="text-accent-400" />
            <span>{message.routeReason}</span>
          </div>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.attachments.map((a) =>
              isImageAttachment(a) ? (
                <img
                  key={a.id}
                  src={a.dataUrl}
                  alt={a.name}
                  className="max-h-48 rounded-xl border border-base-700/60 object-contain"
                />
              ) : (
                <span
                  key={a.id}
                  className="flex items-center gap-1.5 rounded-lg border border-base-700/60 bg-base-900/60 px-2 py-1 text-xs text-slate-300"
                >
                  <FileText size={12} /> {a.name}
                </span>
              )
            )}
          </div>
        )}
        <div
          className={`min-w-0 max-w-full rounded-2xl px-4 py-3 ${
            isUser ? "bg-base-700/70 text-slate-100" : "bg-base-900/50 text-slate-200"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.content}</p>
          ) : message.content ? (
            <Markdown content={message.content} math />
          ) : message.streaming ? (
            <span className="flex items-center gap-2 text-sm text-slate-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-500" /> Thinking…
            </span>
          ) : null}
        </div>
        {message.error && (
          <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <TriangleAlert size={13} className="shrink-0" />
            <span className="min-w-0 flex-1">{message.error}</span>
            {onRetry && (
              <button onClick={onRetry} className="shrink-0 font-medium text-red-200 underline hover:text-white">
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const STARTERS = [
  "Grade this paragraph against my usual standard and tell me what's weak.",
  "Draft an opening paragraph in my voice about why deadlines help.",
  "Work through the integral of x²·eˣ from 0 to 1, step by step.",
  "What are the three habits in my writing I should drop?",
];

export function TutorPage({ onExit }: { onExit: () => void }) {
  const samples = useTutorStore((s) => s.samples);
  const profile = useTutorStore((s) => s.profile);
  const messages = useTutorStore((s) => s.messages);
  const analyzing = useTutorStore((s) => s.analyzing);
  const storageNotice = useTutorStore((s) => s.storageNotice);

  const [adding, setAdding] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [override, setOverride] = useState<ModelDef | null>(null);
  const [pane, setPane] = useState<"style" | "tutor">("tutor");
  const textInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);

  const totalWords = useMemo(() => sampleWordCount(samples), [samples]);
  const ready = totalWords >= MIN_ANALYSIS_WORDS && !samples.some((s) => s.transcribing);
  // The profile is stale once the corpus it was built from no longer matches what's here.
  const stale = useMemo(() => {
    if (!profile) return false;
    const current = samples.filter((s) => s.text.trim()).map((s) => s.id);
    return current.length !== profile.sampleIds.length || current.some((id) => !profile.sampleIds.includes(id));
  }, [profile, samples]);

  const streaming = messages.some((m) => m.streaming);
  const models = useMemo(() => getAllModels().filter((m) => m.supportsStreaming && !m.knownBroken), []);

  // Follow the stream — the conversation column is its own scroll container.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Cancel an in-flight analysis if the page goes away mid-request.
  useEffect(() => () => analysisAbortRef.current?.abort(), []);

  const addTextSample = (title: string, text: string) => {
    useTutorStore.getState().addSample({
      id: uid(),
      title,
      text: text.slice(0, MAX_SAMPLE_CHARS),
      source: "typed",
      createdAt: Date.now(),
    });
    setAdding(false);
  };

  const handleTextFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const text = await file.text().catch(() => "");
      if (!text.trim()) continue;
      useTutorStore.getState().addSample({
        id: uid(),
        title: file.name,
        text: text.slice(0, MAX_SAMPLE_CHARS),
        source: "file",
        createdAt: Date.now(),
      });
    }
  };

  /**
   * An uploaded photo of the user's work: transcribed by a vision model, then kept as a
   * text sample. Only a small thumbnail of the photo is stored — the full-size copy is
   * used for the transcription and then dropped.
   */
  const handleImageFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const id = uid();
      try {
        const prepared = await fileToPreparedDataUrl(file, 2048);
        const thumb = await shrinkDataUrl(prepared.dataUrl, SAMPLE_THUMB_PX);
        useTutorStore.getState().addSample({
          id,
          title: file.name || "Photo of my work",
          text: "",
          imageDataUrl: thumb,
          source: "image",
          createdAt: Date.now(),
          transcribing: true,
        });
        const controller = new AbortController();
        const text = await transcribeImageSample(prepared.dataUrl, file.name || "sample", controller.signal);
        useTutorStore.getState().updateSample(id, { text, transcribing: false, error: undefined });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't read that image.";
        const exists = useTutorStore.getState().samples.some((s) => s.id === id);
        if (exists) useTutorStore.getState().updateSample(id, { transcribing: false, error: message });
      }
    }
  };

  const analyze = async () => {
    setAnalysisError(null);
    useTutorStore.getState().setAnalyzing(true);
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    try {
      const next = await analyzeSamples(useTutorStore.getState().samples, controller.signal);
      useTutorStore.getState().setProfile(next);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "The analysis failed. Try again.");
    } finally {
      analysisAbortRef.current = null;
      useTutorStore.getState().setAnalyzing(false);
    }
  };

  /**
   * Sends one turn. Attachments are re-encoded smaller before they're stored, since the
   * conversation is persisted to localStorage — and the same shrunk copy is what goes
   * upstream, which keeps a later turn's history identical to what's on screen.
   */
  const send = async (text: string, attachments: Attachment[]) => {
    const stored: Attachment[] = await Promise.all(
      attachments.map(async (a) =>
        isImageAttachment(a) ? { ...a, dataUrl: await shrinkDataUrl(a.dataUrl, ATTACHMENT_PREVIEW_PX) } : a
      )
    );
    const hasImages = stored.some(isImageAttachment);
    const route = routeTutorTurn({ text, hasImages, override: override ?? undefined });

    const store = useTutorStore.getState();
    const priorHistory = store.messages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content, attachments: m.attachments }));

    store.addMessage({
      id: uid(),
      role: "user",
      content: text,
      createdAt: Date.now(),
      attachments: stored.length ? stored : undefined,
    });
    const assistantId = uid();
    store.addMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model: route.model,
      task: route.task,
      routeReason: route.reason,
      effort: route.effort,
      streaming: true,
    });
    setPane("tutor");

    await runTutorTurn({
      messageId: assistantId,
      model: route.model,
      task: route.task,
      effort: route.effort,
      profile: useTutorStore.getState().profile,
      history: [...priorHistory, { role: "user", content: text, attachments: stored.length ? stored : undefined }],
    });
  };

  /** Re-runs the last turn: drops the failed reply and replays the user message that caused it. */
  const retryLast = async () => {
    const store = useTutorStore.getState();
    const last = store.messages[store.messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const prompt = store.messages[store.messages.length - 2];
    if (!prompt || prompt.role !== "user") return;
    store.removeMessagesFrom(prompt.id);
    await send(prompt.content, prompt.attachments ?? []);
  };

  const stopStreaming = () => {
    const active = useTutorStore.getState().messages.find((m) => m.streaming);
    if (active) useTutorStore.getState().stop(active.id);
  };

  const stylePanel = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-4 py-5">
      <div>
        <h2 className="text-sm font-semibold text-white">Your writing</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Give it work you've already done. It reads your samples, learns how you write, and keeps the profile in this
          browser only — nothing here is uploaded or synced.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-lg border border-base-600/60 bg-base-800/60 px-3 py-2 text-xs font-medium text-slate-200 hover:border-accent-500/50 hover:text-white"
        >
          <Plus size={13} /> Paste text
        </button>
        <button
          onClick={() => textInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-base-600/60 bg-base-800/60 px-3 py-2 text-xs font-medium text-slate-200 hover:border-accent-500/50 hover:text-white"
        >
          <FileText size={13} /> Upload file
        </button>
        <button
          onClick={() => imageInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-base-600/60 bg-base-800/60 px-3 py-2 text-xs font-medium text-slate-200 hover:border-accent-500/50 hover:text-white"
        >
          <ImageIcon size={13} /> Upload image
        </button>
        <input
          ref={textInputRef}
          type="file"
          multiple
          accept=".txt,.md,.markdown,.csv,.json,text/*"
          className="hidden"
          onChange={(e) => {
            void handleTextFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void handleImageFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {adding && <AddSampleForm onAdd={addTextSample} onCancel={() => setAdding(false)} />}

      {samples.length === 0 && !adding && (
        <div className="rounded-xl border border-dashed border-base-700/60 px-4 py-8 text-center">
          <PenLine size={20} className="mx-auto text-slate-600" />
          <p className="mt-2 text-sm text-slate-400">No samples yet</p>
          <p className="mt-1 text-xs text-slate-500">
            An essay, an email, a blog post — or a photo of something you wrote by hand.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {samples.map((s) => (
          <SampleCard key={s.id} sample={s} onRemove={() => useTutorStore.getState().removeSample(s.id)} />
        ))}
      </div>

      {samples.length > 0 && (
        <div className="rounded-xl border border-base-700/60 bg-base-900/40 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{totalWords.toLocaleString()} words collected</span>
            <span className="text-slate-500">{MIN_ANALYSIS_WORDS} needed</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-base-700/60">
            <div
              className="h-full rounded-full bg-accent-500/70 transition-[width]"
              style={{ width: `${Math.min(100, (totalWords / MIN_ANALYSIS_WORDS) * 100)}%` }}
            />
          </div>
          <button
            onClick={analyze}
            disabled={!ready || analyzing}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-xs font-semibold text-base-950 hover:bg-accent-400 disabled:cursor-not-allowed disabled:bg-base-600 disabled:text-slate-500"
          >
            {analyzing ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Reading your writing…
              </>
            ) : (
              <>
                {profile ? <RefreshCw size={13} /> : <BrainCog size={13} />}
                {profile ? "Re-analyze my writing" : "Learn how I write"}
              </>
            )}
          </button>
          {!ready && !analyzing && (
            <p className="mt-2 text-center text-[11px] text-slate-500">
              {samples.some((s) => s.transcribing)
                ? "Waiting for an image to finish transcribing…"
                : `Add ${(MIN_ANALYSIS_WORDS - totalWords).toLocaleString()} more words to analyze.`}
            </p>
          )}
        </div>
      )}

      {analysisError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" />
          <span>{analysisError}</span>
        </div>
      )}

      {profile && <ProfileCard profile={profile} stale={stale} />}

      {profile && (
        <button
          onClick={() => useTutorStore.getState().setProfile(null)}
          className="self-start text-[11px] text-slate-500 underline hover:text-slate-300"
        >
          Delete this profile
        </button>
      )}
    </div>
  );

  const conversation = (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto w-full max-w-3xl space-y-5">
          {messages.length === 0 ? (
            <div className="pt-8 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700">
                <GraduationCap size={22} className="text-base-950" />
              </div>
              <h2 className="mt-3 text-lg font-semibold text-white">
                {profile ? "Ready when you are" : "Start by adding your writing"}
              </h2>
              <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-400">
                {profile
                  ? "It knows your voice. Ask it to draft, critique, explain, or work through a problem — attach a photo of your work if that's easier."
                  : "You can ask anything right now, but add a few samples first and it will answer in your own voice instead of a generic one."}
              </p>
              <div className="mx-auto mt-5 grid max-w-lg gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s, [])}
                    className="rounded-xl border border-base-700/60 bg-base-900/40 px-3 py-2.5 text-left text-xs leading-relaxed text-slate-300 hover:border-accent-500/50 hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <MessageBubble
                key={m.id}
                message={m}
                onRetry={m.error && i === messages.length - 1 ? () => void retryLast() : undefined}
              />
            ))
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-5">
        <Composer
          onSend={(text, attachments) => void send(text, attachments)}
          onStop={stopStreaming}
          generating={streaming}
          showCodeToggle={false}
          model={override ?? undefined}
          placeholder={profile ? "Ask your tutor anything…" : "Ask anything — or add samples first…"}
        />
        <p className="mt-2 text-center text-[11px] text-slate-600">
          {override
            ? `Locked to ${override.displayName}.`
            : "The model is picked per message — vision for images, a reasoning model for maths, the best prose model for writing."}
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh w-full flex-col bg-base-950">
      <header className="flex shrink-0 items-center gap-3 border-b border-base-700/60 bg-base-950/90 px-4 py-3 backdrop-blur">
        <button
          onClick={onExit}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-700/60 hover:text-white"
          title="Back to Scribble"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700">
          <LogoMark size={15} className="text-base-950" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-white">Tutor</h1>
          <p className="truncate text-xs text-slate-500">
            {profile ? `Writing in your voice · ${profile.wordCount.toLocaleString()} words learned` : "Learns how you write, then teaches from it"}
          </p>
        </div>

        <Dropdown
          align="right"
          menuClassName="w-64 max-h-80 overflow-y-auto"
          trigger={({ toggle, open }) => (
            <button
              onClick={toggle}
              className="flex items-center gap-1.5 rounded-lg border border-base-600/60 bg-base-800/60 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-accent-500/50 hover:text-white"
              title="Which model answers"
            >
              {override ? <ModelFavicon model={override} size={13} /> : <Wand2 size={13} className="text-accent-400" />}
              <span className="max-w-[130px] truncate">{override ? override.displayName : "Auto"}</span>
              <ChevronDown size={12} className={open ? "rotate-180" : ""} />
            </button>
          )}
        >
          {({ close }) => (
            <>
              <button
                onClick={() => {
                  setOverride(null);
                  close();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-base-700/50"
              >
                <Wand2 size={14} className="text-accent-400" />
                <span className="flex-1">Auto</span>
                {!override && <Check size={13} className="text-accent-400" />}
              </button>
              <div className="my-1 border-t border-base-700/50" />
              {models.map((m) => (
                <button
                  key={`${m.provider}:${m.modelId}`}
                  onClick={() => {
                    setOverride(m);
                    close();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-300 hover:bg-base-700/50"
                >
                  <ModelFavicon model={m} size={14} />
                  <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                  {override?.modelId === m.modelId && <Check size={13} className="text-accent-400" />}
                </button>
              ))}
            </>
          )}
        </Dropdown>

        {messages.length > 0 && (
          <button
            onClick={() => useTutorStore.getState().clearConversation()}
            className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-400 hover:bg-base-700/60 hover:text-white"
            title="Clear the conversation (your samples and profile stay)"
            aria-label="Clear the conversation"
          >
            <Trash2 size={13} />
            <span className="hidden sm:inline">Clear chat</span>
          </button>
        )}
      </header>

      {storageNotice && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          <TriangleAlert size={13} className="shrink-0" />
          <span className="min-w-0 flex-1">{storageNotice}</span>
          <button onClick={() => useTutorStore.getState().clearNotice()} className="shrink-0 hover:text-white">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Mobile: one pane at a time. Desktop: samples beside the conversation. */}
      <div className="flex shrink-0 gap-1 border-b border-base-700/60 px-4 py-2 lg:hidden">
        {(["style", "tutor"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPane(p)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              pane === p ? "bg-base-700/70 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {p === "style" ? `My writing${samples.length ? ` (${samples.length})` : ""}` : "Tutor"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`w-full min-w-0 border-base-700/60 lg:block lg:w-[380px] lg:shrink-0 lg:border-r ${
            pane === "style" ? "block" : "hidden"
          }`}
        >
          {stylePanel}
        </aside>
        <main className={`min-w-0 flex-1 ${pane === "tutor" ? "block" : "hidden lg:block"}`}>{conversation}</main>
      </div>
    </div>
  );
}
