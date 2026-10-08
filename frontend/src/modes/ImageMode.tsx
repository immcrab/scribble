import { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Send,
  Loader2,
  ChevronDown,
  Paperclip,
  X,
  Wand2,
  Sparkles,
  SlidersHorizontal,
  Dices,
  Check,
  Shuffle,
  Palette,
} from "lucide-react";
import { useChatStore } from "../state/chatStore";
import { ChatMessage } from "../components/ChatMessage";
import { Dropdown } from "../components/Dropdown";
import { Segmented } from "../components/Segmented";
import { ImageGeneratingLoader } from "../components/ImageGeneratingLoader";
import { generateImage, editImage } from "../lib/imageClient";
import { fileToPreparedDataUrl } from "../lib/imagePrep";
import { watermarkImage } from "../lib/watermark";
import { watermarkConfig } from "../lib/catalogSync";
import {
  IMAGE_MODELS,
  IMAGE_QUALITIES,
  DEFAULT_IMAGE_QUALITY,
  CLOUDFLARE_SIZES,
  findImageModel,
  randomImageSeed,
  EDIT_IMAGE_MODEL,
} from "../config/imageModels";
import { IMAGE_STYLES, findImageStyle, applyImageStyle } from "../config/imageStyles";
import { recordImageUsage, mediaUsageGate } from "../lib/usage";
import { auth } from "../lib/firebase";
import { isLocalDev } from "../lib/devMode";
import { useAutoScroll } from "../lib/useAutoScroll";
import { uid } from "../lib/id";
import type { Attachment, ChatMessage as ChatMessageType } from "../types";
import type { InitialPrompt } from "../App";

const SUGGESTIONS = [
  "Editorial campaign for a translucent running shoe, studio light, product close-up",
  "A tiny moonbase greenhouse at blue hour, cinematic wide shot",
  "Dreamy boutique hotel lobby in Lisbon, warm afternoon light, interior photography",
];

/** A wider pool for the "Inspire me" button, so repeat visits don't feel canned. */
const INSPIRATION = [
  ...SUGGESTIONS,
  "A lighthouse keeper's kitchen during a storm, warm lamplight, oil painting",
  "Macro photograph of a dew-covered spider web at sunrise",
  "A neon-lit ramen stall in a rainy alley, reflections on wet asphalt",
  "Paper-cut diorama of a fox crossing a snowy forest",
  "An astronaut reading a paperback on a quiet red desert dune",
  "Art deco train station in a floating city, golden hour haze",
  "Isometric tiny bakery with a glowing oven, soft clay render",
];

const ASPECT_RATIOS = [
  { id: "1:1", label: "Square", size: "1024x1024" },
  { id: "3:4", label: "Portrait", size: "1024x1365" },
  { id: "4:3", label: "Landscape", size: "1365x1024" },
  { id: "9:16", label: "Story", size: "1024x1792" },
  { id: "16:9", label: "Wide", size: "1792x1024" },
] as const;

/** Roughly 9MB of raw image — the Worker rejects data: URLs over ~12M chars. */
const MAX_SOURCE_BYTES = 9 * 1024 * 1024;

/** A little outline rectangle at the real proportions of the ratio it labels. */
function RatioShape({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(":").map(Number);
  const k = 13 / Math.max(w, h);
  return <span aria-hidden="true" className="inline-block shrink-0 rounded-[3px] border-[1.5px] border-current" style={{ width: Math.round(w * k), height: Math.round(h * k) }} />;
}

export function ImageMode({
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
  const [source, setSource] = useState<{ dataUrl: string; name: string } | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageModel = findImageModel(settings.imageModelId);
  const imageStyle = findImageStyle(settings.imageStyleId);
  const aspectRatio = ASPECT_RATIOS.find((ratio) => ratio.id === settings.imageAspectRatio) ?? ASPECT_RATIOS[0];
  const quality = settings.imageQuality ?? DEFAULT_IMAGE_QUALITY;
  const negativePrompt = settings.imageNegativePrompt ?? "";
  const seed = settings.imageSeed;
  const chatEndRef = useAutoScroll<HTMLDivElement>(chat?.messages ?? []);

  if (!chat) return null;

  const generating = chat.messages.some((m) => m.streaming);
  const opts = imageModel.options;
  const customized = !!negativePrompt.trim() || typeof seed === "number" || quality !== DEFAULT_IMAGE_QUALITY;

  const loadSourceFile = async (file: File | undefined) => {
    if (!file) return;
    setSourceError(null);
    if (!file.type.startsWith("image/")) {
      setSourceError("That file isn't an image.");
      return;
    }
    try {
      const prepared = await fileToPreparedDataUrl(file);
      if (prepared.size > MAX_SOURCE_BYTES) {
        setSourceError("That image is too large — try one under 9MB.");
        return;
      }
      setSource({ dataUrl: prepared.dataUrl, name: file.name || "source.png" });
      inputRef.current?.focus();
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Could not load that image.");
    }
  };

  const editFromAttachment = (a: Attachment) => {
    if (!a.dataUrl) return;
    setSourceError(null);
    setSource({ dataUrl: a.dataUrl, name: a.name || "source.png" });
    inputRef.current?.focus();
  };

  const varyFromAttachment = (a: Attachment) => {
    if (!a.dataUrl) return;
    setSourceError(null);
    setSource({ dataUrl: a.dataUrl, name: a.name || "generated.png" });
    setPrompt("Create a distinct polished variation of this image while preserving its subject and overall direction.");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const inspire = () => {
    const pick = INSPIRATION[Math.floor(Math.random() * INSPIRATION.length)];
    setPrompt(pick);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || generating) return;
    const editingSource = source;
    setPrompt("");

    const userMsg: ChatMessageType = {
      id: uid(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
      ...(editingSource
        ? {
            attachments: [
              {
                id: uid(),
                name: editingSource.name,
                type: "image/png",
                dataUrl: editingSource.dataUrl,
                size: editingSource.dataUrl.length,
              },
            ],
          }
        : {}),
    };
    addMessage(chat.id, userMsg);
    maybeAutoTitle(chat.id, trimmed);
    setSource(null);

    const assistantMsg: ChatMessageType = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      streaming: true,
      thinkingStartedAt: Date.now(),
    };
    addMessage(chat.id, assistantMsg);

    if (!auth.currentUser && !isLocalDev()) {
      updateMessage(chat.id, assistantMsg.id, {
        streaming: false,
        error: editingSource ? "Sign in to edit images." : "Sign in to generate images.",
      });
      return;
    }

    const gate = mediaUsageGate("image");
    if (!gate.ok) {
      updateMessage(chat.id, assistantMsg.id, { streaming: false, error: gate.reason });
      return;
    }

    try {
      const canvas = opts.size && imageModel.provider === "cloudflare" ? CLOUDFLARE_SIZES[aspectRatio.id] : undefined;
      const rawUrl = editingSource
        ? await editImage({
            workerUrl: settings.workerUrl,
            password: settings.password,
            prompt: trimmed,
            image: editingSource.dataUrl,
            model: EDIT_IMAGE_MODEL.model,
            size: aspectRatio.size,
          })
        : await generateImage({
            workerUrl: settings.workerUrl,
            password: settings.password,
            prompt: applyImageStyle(trimmed, settings.imageStyleId),
            provider: imageModel.provider,
            model: imageModel.model,
            size: imageModel.provider === "xkiro" ? aspectRatio.size : undefined,
            negativePrompt: opts.negativePrompt ? negativePrompt : undefined,
            steps: opts.steps?.[quality],
            seed: opts.seed ? (typeof seed === "number" ? seed : randomImageSeed()) : undefined,
            width: canvas?.width,
            height: canvas?.height,
          });
      const wm = watermarkConfig();
      const dataUrl = wm.enabled ? await watermarkImage(rawUrl, wm) : rawUrl;
      recordImageUsage(editingSource ? EDIT_IMAGE_MODEL.billing : imageModel.billing);
      // updateMessage mirrors the generated attachment into the signed-in
      // user's private storage without delaying the result.
      updateMessage(chat.id, assistantMsg.id, {
        streaming: false,
        attachments: [{
          id: uid(), name: "generated.png", type: "image/png", dataUrl, size: dataUrl.length,
          library: {
            category: "generated",
            prompt: trimmed,
            model: editingSource ? EDIT_IMAGE_MODEL.displayName : imageModel.displayName,
          },
        }],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Image generation failed.";
      updateMessage(chat.id, assistantMsg.id, { streaming: false, error: message });
    }
  };

  useEffect(() => {
    if (initialPrompt && chat.messages.length === 0) {
      send(initialPrompt.prompt);
      onConsumeInitial?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-base-700/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <ImageIcon size={15} className="text-accent-400" />
          <span className="text-sm font-medium text-slate-200">Image generation</span>
        </div>
        <div className="flex items-center gap-1">
        <Dropdown
          align="right"
          label="Style preset"
          menuClassName="w-[19rem] max-w-[calc(100vw-2rem)] overflow-y-auto max-h-[60vh]"
          trigger={({ open, toggle }) => (
            <button
              onClick={toggle}
              className="flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-sm font-medium text-slate-400 hover:border-base-600 hover:bg-base-800/70 hover:text-slate-200"
              title="Style preset"
            >
              <Palette size={14} className={imageStyle.id === "none" ? "text-slate-500" : "text-accent-400"} />
              {imageStyle.label}
              <ChevronDown size={14} className={`text-slate-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </button>
          )}
        >
          {({ close }) => (
            <div className="menu-cascade grid grid-cols-2 gap-1.5 p-2">
              {IMAGE_STYLES.map((s) => {
                const active = s.id === imageStyle.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      updateSettings({ imageStyleId: s.id });
                      close();
                    }}
                    aria-current={active ? "true" : undefined}
                    title={s.suffix || "Send the prompt untouched"}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                      active
                        ? "border-accent-500/60 bg-accent-500/10 text-white"
                        : "border-base-700/60 text-slate-300 hover:border-base-600 hover:bg-base-700/50"
                    }`}
                  >
                    <span className="truncate">{s.label}</span>
                    {active && <Check size={13} className="shrink-0 animate-pop-in text-accent-400" aria-label="Selected" />}
                  </button>
                );
              })}
            </div>
          )}
        </Dropdown>
        <Dropdown
          align="right"
          label="Image model"
          menuClassName="w-72 max-w-[calc(100vw-2rem)] overflow-hidden"
          trigger={({ open, toggle }) => (
            <button
              onClick={toggle}
              className="flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-sm font-medium text-slate-200 hover:border-base-600 hover:bg-base-800/70"
            >
              {imageModel.displayName}
              <ChevronDown size={14} className={`text-slate-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </button>
          )}
        >
          {({ close }) => (
            <div className="menu-cascade py-1">
              {IMAGE_MODELS.map((m) => {
                const active = m.id === imageModel.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      updateSettings({ imageModelId: m.id });
                      close();
                    }}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full items-start gap-2 px-3.5 py-2.5 text-left hover:bg-base-700/50 ${active ? "row-active bg-accent-500/10" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-medium ${active ? "text-white" : "text-slate-200"}`}>{m.displayName}</span>
                      <span className="block text-xs text-slate-500">{m.desc}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {m.options.negativePrompt && <span className="rounded border border-base-600/60 px-1 py-px text-[10px] text-slate-400">Avoid prompt</span>}
                        {m.options.seed && <span className="rounded border border-base-600/60 px-1 py-px text-[10px] text-slate-400">Seed</span>}
                        {m.options.steps && <span className="rounded border border-base-600/60 px-1 py-px text-[10px] text-slate-400">Detail</span>}
                      </span>
                    </span>
                    {active && <Check size={14} className="mt-0.5 shrink-0 animate-pop-in text-accent-400" aria-label="Selected" />}
                  </button>
                );
              })}
            </div>
          )}
        </Dropdown>
        <button
          type="button"
          onClick={() => setOptionsOpen((o) => !o)}
          aria-expanded={optionsOpen}
          aria-controls="image-options"
          title="Generation options"
          className={`relative flex h-8 w-8 items-center justify-center rounded-lg border ${
            optionsOpen ? "border-accent-500/50 bg-accent-500/10 text-accent-400" : "border-transparent text-slate-400 hover:border-base-600 hover:bg-base-800/70 hover:text-slate-200"
          }`}
        >
          <SlidersHorizontal size={15} />
          {customized && <span aria-hidden="true" className="absolute right-1 top-1 h-1.5 w-1.5 animate-pop-in rounded-full bg-accent-400" />}
          <span className="sr-only">Generation options</span>
        </button>
        </div>
      </div>

      {chat.messages.length === 0 ? (
        <div className="image-studio-grid flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
          <div className="image-studio-orb"><Sparkles size={22} /></div>
          <div className="animate-fade-in-up">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-400">Creative studio</p>
            <h1 className="font-serif text-3xl font-light tracking-tighter text-slate-100 sm:text-4xl">
              Make a direction, not just an image.
            </h1>
          </div>
          <div className="stagger flex flex-col gap-2 sm:flex-row">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="hover-lift max-w-xs rounded-xl border border-base-700/60 bg-base-850/60 p-3 text-left text-xs text-slate-400 hover:border-accent-500/50 hover:text-slate-200"
              >
                {s}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">Choose a format, write a direction, or attach an image to refine it.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8" ref={chatEndRef}>
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {chat.messages.map((m) =>
              m.role === "assistant" && m.streaming && !m.error ? (
                <div key={m.id} className="flex animate-fade-in-up gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-accent-500/60 bg-base-900/90 shadow-glow">
                    <ImageIcon size={14} className="text-accent-400" />
                  </div>
                  <ImageGeneratingLoader startedAt={m.thinkingStartedAt} />
                </div>
              ) : (
                <ChatMessage key={m.id} message={m} onEditImage={editFromAttachment} onVaryImage={varyFromAttachment} />
              )
            )}
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-8">
        {source && (
          <div className="mb-2 flex animate-fade-in-up items-center gap-3 rounded-xl border border-accent-500/40 bg-base-850/70 p-2">
            <img
              src={source.dataUrl}
              alt={source.name}
              className="h-12 w-12 shrink-0 rounded-lg border border-base-700/60 object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-accent-400">
                <Wand2 size={12} />
                Editing this image
              </div>
              <div className="truncate text-[11px] text-slate-500">{source.name}</div>
            </div>
            <button
              onClick={() => setSource(null)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-base-700/60 hover:text-slate-200"
              title="Cancel editing"
            >
              <X size={15} />
            </button>
          </div>
        )}
        {sourceError && (
          <div className="mb-2 animate-fade-in-up rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {sourceError}
          </div>
        )}

        {/* Generation options — a collapsible card; grid-rows animates the height without measuring. */}
        <div
          id="image-options"
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out-expo ${optionsOpen ? "mb-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
          aria-hidden={!optionsOpen}
        >
          <div className={`overflow-hidden ${optionsOpen ? "visible" : "invisible [transition:visibility_0s_linear_300ms]"}`}>
            <div className="opt-panel space-y-4 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="opt-label">Detail</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {opts.steps ? `${imageModel.displayName} · ${opts.steps[quality]} steps` : `${imageModel.displayName} manages detail itself`}
                  </p>
                </div>
                <Segmented
                  ariaLabel="Detail level"
                  value={quality}
                  disabled={!opts.steps || generating}
                  onChange={(v) => updateSettings({ imageQuality: v })}
                  options={IMAGE_QUALITIES.map((q) => ({ value: q.id, label: q.label, title: q.hint }))}
                />
              </div>

              <label className="block">
                <span className="opt-label">Avoid</span>
                <input
                  value={negativePrompt}
                  onChange={(e) => updateSettings({ imageNegativePrompt: e.target.value.slice(0, 300) })}
                  disabled={!opts.negativePrompt}
                  placeholder={opts.negativePrompt ? "blurry, extra fingers, text, watermark" : `Not used by ${imageModel.displayName}`}
                  className="mt-1.5 w-full rounded-lg border border-base-700/70 bg-base-900/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-accent-500/60 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>

              <div>
                <div className="flex items-center justify-between">
                  <span className="opt-label">Seed</span>
                  <span className="text-[11px] text-slate-500">
                    {!opts.seed ? `Not used by ${imageModel.displayName}` : typeof seed === "number" ? "Locked — same seed, same composition" : "Random every time"}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={4294967295}
                    value={typeof seed === "number" ? seed : ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      updateSettings({ imageSeed: raw === "" ? undefined : Math.min(4294967295, Math.max(0, Math.floor(Number(raw)) || 0)) });
                    }}
                    disabled={!opts.seed}
                    placeholder="Random"
                    aria-label="Seed"
                    className="min-w-0 flex-1 rounded-lg border border-base-700/70 bg-base-900/60 px-3 py-2 text-sm tabular-nums text-slate-200 placeholder-slate-600 outline-none focus:border-accent-500/60 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => updateSettings({ imageSeed: randomImageSeed() })}
                    disabled={!opts.seed}
                    title="Pick a random seed and lock it"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-base-700/70 text-slate-300 hover:border-accent-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Dices size={15} />
                    <span className="sr-only">Randomize seed</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ imageSeed: undefined })}
                    disabled={!opts.seed || typeof seed !== "number"}
                    title="Back to a new random seed each time"
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-base-700/70 px-2.5 text-xs text-slate-300 hover:border-accent-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Shuffle size={13} />
                    Unlock
                  </button>
                </div>
              </div>

              {customized && (
                <button
                  type="button"
                  onClick={() => updateSettings({ imageQuality: undefined, imageNegativePrompt: "", imageSeed: undefined })}
                  className="text-[11px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                >
                  Reset options
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1 overflow-x-auto pb-1" role="group" aria-label="Aspect ratio">
            {ASPECT_RATIOS.map((ratio) => {
              const on = ratio.id === aspectRatio.id;
              return (
                <button
                  key={ratio.id}
                  onClick={() => updateSettings({ imageAspectRatio: ratio.id })}
                  disabled={generating}
                  aria-pressed={on}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
                    on
                      ? "border-accent-500/50 bg-accent-500/10 text-accent-400"
                      : "border-base-700/70 bg-base-850/40 text-slate-500 hover:border-base-600 hover:text-slate-300"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                  title={`${ratio.label} (${ratio.id})`}
                >
                  <RatioShape ratio={ratio.id} />
                  {ratio.id}
                </button>
              );
            })}
          </div>
          <span className="hidden shrink-0 text-[11px] text-slate-500 sm:inline">
            {aspectRatio.label}
            {!opts.size && !source ? " · fixed by model" : ""}
          </span>
        </div>
        <div className="image-composer flex items-center gap-2 rounded-2xl border border-base-600/60 bg-base-850/70 p-2 shadow-panel">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              loadSourceFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={generating}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-base-700/60 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            title="Attach an image to edit"
          >
            <Paperclip size={16} />
          </button>
          <input
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onPaste={(e) => {
              const file = Array.from(e.clipboardData.items).find((i) => i.kind === "file")?.getAsFile();
              if (file && file.type.startsWith("image/")) {
                e.preventDefault();
                loadSourceFile(file);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(prompt);
              }
            }}
            placeholder={source ? "Describe the change you want..." : "Describe the image you want..."}
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-white outline-none placeholder-slate-500"
          />
          {!prompt && !source && (
            <button
              onClick={inspire}
              disabled={generating}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-xs text-slate-400 hover:bg-base-700/60 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              title="Fill in an idea"
            >
              <Dices size={14} />
              <span className="hidden sm:inline">Inspire me</span>
            </button>
          )}
          <button
            onClick={() => send(prompt)}
            disabled={!prompt.trim() || generating}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-base-950 hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40"
            title={source ? "Apply edit" : "Generate"}
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
        {source && (
          <p className="mt-1.5 px-1 text-[11px] text-slate-500">
            Edits run on {EDIT_IMAGE_MODEL.displayName}, regardless of the model above.
          </p>
        )}
      </div>
    </div>
  );
}
