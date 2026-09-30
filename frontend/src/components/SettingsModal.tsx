import { useEffect, useMemo, useRef, useState } from "react";
import { useModalFocus } from "../lib/useModalFocus";
import {
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  Check,
  Sliders,
  Palette,
  UserCircle2,
  Blocks,
  Brain,
  Sun,
  Moon,
  Monitor,
  Lock,
  Trash2,
  Plus,
  Type,
  AlignJustify,
  Languages,
  Wrench,
  Bell,
  Search,
  Sparkles,
  Server,
  HardDrive,
  ShieldCheck,
} from "lucide-react";
import { useChatStore } from "../state/chatStore";
import { useAuthStore } from "../state/authStore";
import { checkWorkerHealth } from "../lib/workerClient";
import { getAllModels, getDefaultModel, isModelGated } from "../config/models";
import type { Theme } from "../lib/theme";
import { FONT_OPTIONS, THEME_PALETTE_OPTIONS, REPLY_LANGUAGE_OPTIONS } from "../lib/appearance";
import { ModelFavicon } from "./ProviderIcon";
import { Dropdown } from "./Dropdown";
import { ToggleSwitch } from "./ToggleSwitch";
import { CustomModelsSection } from "./CustomModelsSection";
import { AccountSection } from "./AccountSection";
import { EffortSelector } from "./EffortSelector";
import { PuterNoticeModal } from "./PuterNoticeModal";
import { isPuterSignedIn } from "../lib/puterClient";
import { requestDesktopNotificationPermission } from "../lib/desktopNotifications";
import type { ModelDef } from "../types";
import type { LofinSettings } from "../lib/storage";
import { clearAllLocalData } from "../lib/storage";
import type { Attachment } from "../types";
import { libraryImageUrl, listStorage, type LibraryItem } from "../lib/libraryClient";

function SectionLabel({ children }: { children: string }) {
  return <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h3>;
}

export type SettingsTab = "general" | "appearance" | "notifications" | "personalization" | "privacy" | "account" | "models" | "memory" | "storage" | "advanced";
type Tab = SettingsTab;

const TABS: { id: Tab; label: string; icon: typeof Sliders; group: "Personal" | "Workspace"; keywords: string }[] = [
  { id: "general", label: "General", icon: Sliders, group: "Personal", keywords: "preferences keyboard send web search location" },
  { id: "appearance", label: "Appearance", icon: Palette, group: "Personal", keywords: "theme color font text density language" },
  { id: "notifications", label: "Notifications", icon: Bell, group: "Personal", keywords: "sound browser alerts announcements" },
  { id: "personalization", label: "Personalization", icon: Sparkles, group: "Personal", keywords: "instructions replies preferences" },
  { id: "privacy", label: "Privacy", icon: ShieldCheck, group: "Personal", keywords: "location data security" },
  { id: "memory", label: "Memory", icon: Brain, group: "Personal", keywords: "remember stored memories" },
  { id: "account", label: "Account", icon: UserCircle2, group: "Workspace", keywords: "profile sign in data" },
  { id: "models", label: "Models", icon: Blocks, group: "Workspace", keywords: "providers custom models endpoints" },
  { id: "storage", label: "Storage", icon: HardDrive, group: "Workspace", keywords: "space usage files images chats attachments local data" },
  { id: "advanced", label: "Advanced", icon: Server, group: "Workspace", keywords: "worker connection password request spacing" },
];

const THEME_OPTIONS: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

const TEXT_SIZE_OPTIONS: { id: LofinSettings["textSize"]; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
];

const DENSITY_OPTIONS: { id: LofinSettings["density"]; label: string }[] = [
  { id: "comfortable", label: "Comfortable" },
  { id: "compact", label: "Compact" },
];

function AppearanceSection() {
  const { settings, updateSettings } = useChatStore();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h3 className="mb-5 text-base font-semibold text-white">Appearance</h3>
        <SectionLabel>Visual style</SectionLabel>
        <div className="rounded-2xl border border-base-600/70 bg-base-900/35 p-3">
          <div className="mb-2 flex items-center justify-between px-1"><span className="text-sm font-medium text-slate-200">Mode</span><span className="text-xs text-slate-500">Choose how Lofin looks</span></div>
          <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => updateSettings({ theme: id })}
              className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors ${
                settings.theme === id
                  ? "border-accent-500/60 bg-accent-500/10 text-white"
                  : "border-base-600/60 bg-base-900/60 text-slate-400 hover:border-base-500/60 hover:text-slate-200"
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>Theme</SectionLabel>
        <div className="overflow-hidden rounded-2xl border border-base-600/70 bg-base-900/35">
          <div className="flex items-center justify-between gap-3 border-b border-base-700/60 px-4 py-3">
            <span className="text-sm font-medium text-slate-200">Accent</span>
            <div className="flex flex-wrap justify-end gap-1.5">
          {THEME_PALETTE_OPTIONS.map(({ id, label, swatch }) => (
            <button
              key={id}
              onClick={() => updateSettings({ themePalette: id })}
              title={label}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                (settings.themePalette ?? "mono") === id
                  ? "border-accent-500/60 bg-accent-500/10 text-white"
                  : "border-base-600/60 bg-base-900/60 text-slate-400 hover:border-base-500/60 hover:text-slate-200"
              }`}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full border border-white/10"
                style={{ background: swatch }}
              />
              {label}
            </button>
          ))}
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium text-slate-200">Background</span>
            <span className="rounded-full border border-base-600/70 bg-base-850 px-2.5 py-1 text-xs text-slate-300">Follows mode</span>
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>Typography</SectionLabel>
        <div className="overflow-hidden rounded-2xl border border-base-600/70 bg-base-900/35">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-200"><Type size={15} className="text-slate-500" />Font</span>
        <Dropdown
          matchWidth
          menuClassName="max-h-80"
          trigger={({ open, toggle }) => {
            const current = FONT_OPTIONS.find((f) => f.id === (settings.fontFamily ?? "inter")) ?? FONT_OPTIONS[0];
            return (
              <button
                type="button"
                onClick={toggle}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={`Font: ${current.label}`}
                data-testid="font-picker"
                className="flex items-center gap-2 rounded-full border border-base-600/60 bg-base-850 px-3 py-1.5 text-sm text-white transition-colors hover:border-accent-500/50"
              >
                <Type size={15} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-left">{current.label}</span>
                <ChevronDown size={13} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
            );
          }}
        >
          {({ close }) => (
            <div className="max-h-64 w-full overflow-y-auto py-1">
              {FONT_OPTIONS.map((f) => {
                const isSelected = (settings.fontFamily ?? "inter") === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => {
                      updateSettings({ fontFamily: f.id });
                      close();
                    }}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-base-700/50 ${
                      isSelected ? "bg-accent-500/10 font-medium text-white" : "text-slate-300"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{f.label}</span>
                      <span className="block truncate text-[11px] text-slate-500">{f.note}</span>
                    </span>
                    {isSelected && <Check size={13} className="shrink-0 text-accent-400" />}
                  </button>
                );
              })}
            </div>
          )}
        </Dropdown>
          </div>
        <div className="border-t border-base-700/60 px-4 py-2">
          <ToggleSwitch
            label="Bolder text"
            description="Heavier weight across the whole UI"
            checked={settings.boldText ?? false}
            onChange={(v) => updateSettings({ boldText: v })}
          />
        </div>
        </div>
      </div>

      <div>
        <SectionLabel>Text size</SectionLabel>
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-base-600/70 bg-base-900/35 p-3">
          {TEXT_SIZE_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => updateSettings({ textSize: id })}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors ${
                settings.textSize === id
                  ? "border-accent-500/60 bg-accent-500/10 text-white"
                  : "border-base-600/60 bg-base-900/60 text-slate-400 hover:border-base-500/60 hover:text-slate-200"
              }`}
            >
              <Type size={id === "small" ? 14 : id === "large" ? 20 : 17} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Message density</SectionLabel>
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-base-600/70 bg-base-900/35 p-3">
          {DENSITY_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => updateSettings({ density: id })}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors ${
                settings.density === id
                  ? "border-accent-500/60 bg-accent-500/10 text-white"
                  : "border-base-600/60 bg-base-900/60 text-slate-400 hover:border-base-500/60 hover:text-slate-200"
              }`}
            >
              <AlignJustify size={17} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Reply language</SectionLabel>
        <div className="rounded-2xl border border-base-600/70 bg-base-900/35 p-3">
        <Dropdown
          matchWidth
          menuClassName="max-h-80"
          trigger={({ open, toggle }) => {
            const current =
              REPLY_LANGUAGE_OPTIONS.find((l) => l.id === (settings.replyLanguage ?? "auto")) ?? REPLY_LANGUAGE_OPTIONS[0];
            return (
              <button
                onClick={toggle}
                className="flex w-full items-center gap-2 rounded-full border border-base-600/60 bg-base-850 px-3 py-2 text-sm text-white transition-colors hover:border-accent-500/50"
              >
                <Languages size={15} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-left">{current.label}</span>
                <ChevronDown size={13} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
            );
          }}
        >
          {({ close }) => (
            <div className="max-h-64 w-full overflow-y-auto py-1">
              {REPLY_LANGUAGE_OPTIONS.map((l) => {
                const isSelected = (settings.replyLanguage ?? "auto") === l.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => {
                      updateSettings({ replyLanguage: l.id });
                      close();
                    }}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-base-700/50 ${
                      isSelected ? "bg-accent-500/10 font-medium text-white" : "text-slate-300"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{l.label}</span>
                    {isSelected && <Check size={13} className="shrink-0 text-accent-400" />}
                  </button>
                );
              })}
            </div>
          )}
        </Dropdown>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Lofin always answers in this language, whatever language you write in. Auto matches you.
        </p>
      </div>

      <div>
        <SectionLabel>Default reasoning effort</SectionLabel>
        <div className="rounded-2xl border border-base-600/70 bg-base-900/35 p-3"><EffortSelector value={settings.effort} onChange={(e) => updateSettings({ effort: e })} /></div>
        <p className="mt-2 text-xs text-slate-500">
          Used for new chats — each chat can override it from its own header.
        </p>
      </div>
      <ToggleSwitch label="Reduce motion" description="Turn off streaming and hover animations" checked={settings.reduceMotion} onChange={(v) => updateSettings({ reduceMotion: v })} />
    </div>
  );
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function MemorySection() {
  const { settings, updateSettings, memories, addMemory, deleteMemory } = useChatStore();
  const [draft, setDraft] = useState("");

  const submitDraft = () => {
    const content = draft.trim();
    if (!content) return;
    addMemory(content);
    setDraft("");
  };

  return (
    <div className="space-y-5">
      <ToggleSwitch
        label="Enable memory"
        description={
          'Lets Lofin remember facts across chats — either when you ask it to ("remember that...") or when it decides on its own something\'s worth keeping — and recall them in later conversations. Off by default.'
        }
        checked={settings.memoryEnabled}
        onChange={(v) => updateSettings({ memoryEnabled: v })}
      />

      <div>
        <SectionLabel>Stored memories</SectionLabel>
        <div className="mb-2 flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitDraft();
            }}
            placeholder="Add a memory manually…"
            className="w-full rounded-lg border border-base-600/60 bg-base-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500"
          />
          <button
            onClick={submitDraft}
            disabled={!draft.trim()}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-base-600/60 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-base-700/60 disabled:opacity-50"
          >
            <Plus size={13} />
            Add
          </button>
        </div>

        {memories.length === 0 ? (
          <p className="rounded-lg border border-dashed border-base-700/60 px-3 py-4 text-center text-xs text-slate-500">
            No memories yet — ask Lofin to remember something, or it'll pick up durable facts on its own.
          </p>
        ) : (
          <div className="space-y-1.5">
            {[...memories].reverse().map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-2 rounded-lg border border-base-700/60 bg-base-900/50 px-3 py-2"
              >
                <span className="min-w-0 flex-1 text-sm text-slate-300">{m.content}</span>
                <span className="shrink-0 text-[11px] text-slate-500">{relativeTime(m.createdAt)}</span>
                <button
                  onClick={() => deleteMemory(m.id)}
                  className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-base-700 hover:text-red-400"
                  title="Delete memory"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const INCLUDED_STORAGE_BYTES = 70 * 1024 * 1024;

function formatStorage(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

type StoredAttachment = Attachment & { chatTitle: string; messageId: string };

function CloudImageCard({ item }: { item: LibraryItem }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void libraryImageUrl(item.id, true).then((next) => { if (!cancelled) setUrl(next); });
    return () => { cancelled = true; };
  }, [item.id]);
  return (
    <a href={url ?? undefined} download={item.name || "image"} className="overflow-hidden rounded-xl border border-base-600/70 bg-base-900/40 hover:border-accent-500/50" title={`Download ${item.name || "image"}`}>
      {url ? <img src={url} alt={item.name || "Saved image"} className="aspect-square w-full object-cover" /> : <div className="aspect-square animate-pulse bg-base-800/70" />}
      <span className="block truncate px-2.5 py-2 text-xs text-slate-300">{item.name || "Generated image"}</span>
    </a>
  );
}

function CloudFileRow({ item }: { item: LibraryItem }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void libraryImageUrl(item.id, false).then((next) => { if (!cancelled) setUrl(next); });
    return () => { cancelled = true; };
  }, [item.id]);
  return <a href={url ?? undefined} download={item.name || "file"} className="flex items-center justify-between gap-3 rounded-xl border border-base-600/70 bg-base-900/40 px-3 py-2.5 transition-colors hover:border-accent-500/50 hover:bg-base-700/40">
    <span className="min-w-0"><span className="block truncate text-sm text-slate-200">{item.name || "Saved file"}</span><span className="block text-xs text-slate-500">{formatStorage(item.size)}</span></span>
    <span className="shrink-0 text-xs text-accent-300">{url ? "Download" : "Loading…"}</span>
  </a>;
}

function StorageSection() {
  const { chats, memories, projects } = useChatStore();
  const user = useAuthStore((s) => s.user);
  const [view, setView] = useState<"files" | "images" | "cloud-files" | "cloud-images" | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [cloudItems, setCloudItems] = useState<LibraryItem[] | null>(null);
  useEffect(() => {
    if (!user) { setCloudItems(null); return; }
    let cancelled = false;
    void listStorage().then((page) => { if (!cancelled) setCloudItems(page.items); }).catch(() => { if (!cancelled) setCloudItems([]); });
    return () => { cancelled = true; };
  }, [user]);
  const encoder = new TextEncoder();
  const attachments: StoredAttachment[] = chats.flatMap((chat) =>
    (chat.messages ?? []).flatMap((message) =>
      (message.attachments ?? []).map((attachment) => ({ ...attachment, chatTitle: chat.title || "Untitled chat", messageId: message.id }))
    )
  );
  const images = attachments.filter((attachment) => attachment.type.startsWith("image/") || attachment.dataUrl.startsWith("data:image/"));
  const fileAttachments = attachments.filter((attachment) => !images.includes(attachment));
  const imageBytes = images.reduce((total, attachment) => total + (attachment.size || encoder.encode(attachment.dataUrl).length), 0);
  const fileBytes = fileAttachments.reduce((total, attachment) => total + (attachment.size || encoder.encode(attachment.dataUrl).length), 0);
  const localBytes = [chats, memories, projects].reduce((total, value) => total + encoder.encode(JSON.stringify(value)).length, 0);
  const usedBytes = Math.max(localBytes, imageBytes + fileBytes);
  const usedPercent = Math.min(100, (usedBytes / INCLUDED_STORAGE_BYTES) * 100);
  const cloudImages = cloudItems?.filter((item) => item.type.startsWith("image/")) ?? [];
  const cloudFiles = cloudItems?.filter((item) => !item.type.startsWith("image/")) ?? [];

  const Item = ({ label, detail, onView }: { label: string; detail: string; onView?: () => void }) => (
    <div className="flex items-center justify-between gap-4 border-b border-base-700/60 px-4 py-3 last:border-b-0">
      <div><p className="text-sm font-medium text-slate-100">{label}</p><p className="mt-0.5 text-xs text-slate-500">{detail}</p></div>
      {onView && <button onClick={onView} className="rounded-lg border border-base-600/60 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-accent-500/50 hover:bg-base-700/60 hover:text-white">View</button>}
    </div>
  );
  const viewedAttachments = view === "images" ? images : fileAttachments;
  const isCloudView = view === "cloud-images" || view === "cloud-files";
  const viewedCloudItems = view === "cloud-images" ? cloudImages : cloudFiles;

  return (
    <div className="mx-auto max-w-2xl">
      <h3 className="text-base font-semibold text-white">Storage</h3>
      <p className="mt-5 text-sm font-semibold text-slate-200">{formatStorage(usedBytes)} of 70 MB used</p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-base-700/80"><div className="h-full min-w-1 rounded-full bg-accent-400 transition-all" style={{ width: `${Math.max(usedPercent, usedBytes ? 0.4 : 0)}%` }} /></div>
      <div className="mt-10">
        {user && (
          <div className="mb-5 overflow-hidden rounded-2xl border border-accent-500/25 bg-accent-500/[0.04]">
            <div className="px-4 py-3"><h4 className="text-sm font-semibold text-slate-100">Private cloud storage</h4><p className="mt-0.5 text-xs text-slate-400">Files and generated images are backed up to your account and available across devices.</p></div>
            <Item label="Cloud images" detail={cloudItems === null ? "Loading…" : `${cloudImages.length} ${cloudImages.length === 1 ? "image" : "images"} saved`} onView={cloudItems === null ? undefined : () => setView(view === "cloud-images" ? null : "cloud-images")} />
            <Item label="Cloud files" detail={cloudItems === null ? "Loading…" : `${cloudFiles.length} ${cloudFiles.length === 1 ? "file" : "files"} saved`} onView={cloudItems === null ? undefined : () => setView(view === "cloud-files" ? null : "cloud-files")} />
          </div>
        )}
        <h4 className="text-base font-semibold text-white">Manage storage</h4>
        <p className="mt-1 text-sm text-slate-400">Review data saved in this browser.</p>
        <div className="mt-3 overflow-hidden rounded-2xl border border-base-600/70 bg-base-900/35">
          <Item label="Files" detail={`${formatStorage(fileBytes)} · ${fileAttachments.length} ${fileAttachments.length === 1 ? "file" : "files"}`} onView={() => setView(view === "files" ? null : "files")} />
          <Item label="Images" detail={`${formatStorage(imageBytes)} · ${images.length} ${images.length === 1 ? "image" : "images"}`} onView={() => setView(view === "images" ? null : "images")} />
          <Item label="Chats & memories" detail={`${formatStorage(localBytes)} · ${chats.length} ${chats.length === 1 ? "chat" : "chats"}, ${memories.length} memories`} />
        </div>
      </div>
      {view && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-semibold text-white">{view === "images" || view === "cloud-images" ? "Images" : "Files"}{isCloudView ? " in cloud storage" : ""}</h4><button onClick={() => setView(null)} className="text-xs text-slate-400 hover:text-white">Close</button></div>
          {isCloudView ? (viewedCloudItems.length === 0 ? <p className="rounded-xl border border-dashed border-base-700/60 px-3 py-5 text-center text-xs text-slate-500">No {view === "cloud-images" ? "images" : "files"} saved in cloud storage.</p> : <div className={view === "cloud-images" ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "space-y-2"}>{viewedCloudItems.map((item) => view === "cloud-images" ? <CloudImageCard key={item.id} item={item} /> : <CloudFileRow key={item.id} item={item} />)}</div>) : viewedAttachments.length === 0 ? <p className="rounded-xl border border-dashed border-base-700/60 px-3 py-5 text-center text-xs text-slate-500">No {view} saved in this browser.</p> : (
            <div className={view === "images" ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "space-y-2"}>
              {viewedAttachments.map((attachment) => view === "images" ? (
                <a key={`${attachment.messageId}:${attachment.id}`} href={attachment.dataUrl} download={attachment.name} className="overflow-hidden rounded-xl border border-base-600/70 bg-base-900/40 hover:border-accent-500/50" title={`Download ${attachment.name}`}><img src={attachment.dataUrl} alt={attachment.name} className="aspect-square w-full object-cover" /><span className="block truncate px-2.5 py-2 text-xs text-slate-300">{attachment.name}</span></a>
              ) : (
                <a key={`${attachment.messageId}:${attachment.id}`} href={attachment.dataUrl} download={attachment.name} className="flex items-center justify-between gap-3 rounded-xl border border-base-600/70 bg-base-900/40 px-3 py-2.5 transition-colors hover:border-accent-500/50 hover:bg-base-700/40" title={`Download ${attachment.name}`}><span className="min-w-0"><span className="block truncate text-sm text-slate-200">{attachment.name}</span><span className="block truncate text-xs text-slate-500">{attachment.chatTitle} · {formatStorage(attachment.size || encoder.encode(attachment.dataUrl).length)}</span></span><span className="shrink-0 text-xs text-accent-300">Download</span></a>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/[0.04] p-3">
        {!confirmingClear ? <button onClick={() => setConfirmingClear(true)} className="flex w-full items-center gap-2 text-left text-sm text-red-300 hover:text-red-200"><Trash2 size={15} /><span><span className="block font-medium">Clear all local data</span><span className="block text-xs text-red-300/70">Remove saved files, images, chats, memories, projects, and settings from this browser.</span></span></button> : <div><p className="text-xs text-red-200">This cannot be undone. Synced cloud data is not affected.</p><div className="mt-3 flex gap-2"><button onClick={() => setConfirmingClear(false)} className="flex-1 rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:bg-base-700/60">Cancel</button><button onClick={() => { clearAllLocalData(); window.location.reload(); }} className="flex-1 rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500">Yes, clear all</button></div></div>}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">Attachments are saved with their chats on this device. Files and images can be viewed or downloaded here; chats and memories remain summary-only.</p>
    </div>
  );
}

export function SettingsModal({ onClose, initialTab, onTabChange }: { onClose: () => void; initialTab?: SettingsTab; onTabChange?: (tab: SettingsTab) => void }) {
  const { settings, updateSettings } = useChatStore();
  const user = useAuthStore((s) => s.user);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const [tab, setTab] = useState<Tab>(initialTab ?? "general");
  const [workerUrl, setWorkerUrl] = useState(settings.workerUrl);
  const [password, setPassword] = useState(settings.password);
  const [customSystemPrompt, setCustomSystemPrompt] = useState(settings.customSystemPrompt);
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [pendingPuterModel, setPendingPuterModel] = useState<ModelDef | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [search, setSearch] = useState("");
  const closeTimer = useRef<number | null>(null);
  const visibleTabs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? TABS.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(query)) : TABS;
  }, [search]);

  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  const selectTab = (nextTab: Tab) => { setTab(nextTab); onTabChange?.(nextTab); };

  // Flush the few text fields that aren't live-saved (Worker URL, password, custom
  // instructions), then close. Every other control in here already applies on change,
  // so there's just one "Done" — no Save/Cancel split to reason about.
  const commitAndClose = () => {
    if (isClosing) return;
    updateSettings({ workerUrl: workerUrl.trim(), password, customSystemPrompt: customSystemPrompt.trim() });
    // Let the panel finish its compact exit motion before it unmounts. This
    // keeps the modal from disappearing abruptly without delaying data saves.
    setIsClosing(true);
    closeTimer.current = window.setTimeout(onClose, 180);
  };

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") commitAndClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerUrl, password, customSystemPrompt]);

  const test = async () => {
    setStatus("checking");
    const ok = await checkWorkerHealth(workerUrl.trim());
    setStatus(ok ? "ok" : "fail");
  };

  const defaultModel = getDefaultModel(settings.defaultModelId);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(dialogRef);

  return (
    <>
    <div
      className={`settings-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm ${isClosing ? "settings-backdrop--closing" : ""}`}
      onClick={commitAndClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`settings-panel flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-base-600/60 bg-base-850 shadow-panel ${isClosing ? "settings-panel--closing" : ""}`}
      >
        <div className="flex items-center justify-between border-b border-base-700/60 px-5 py-4 sm:px-6">
          <h2 id="settings-title" className="text-lg font-semibold text-white">Settings</h2>
          <button onClick={commitAndClose} aria-label="Close settings" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-700 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <aside className="w-full shrink-0 border-b border-base-700/60 bg-base-900/35 p-4 sm:w-64 sm:overflow-y-auto sm:border-b-0 sm:border-r">
            <label className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search settings"
                aria-label="Search settings"
                className="w-full rounded-xl border border-base-600/60 bg-base-850 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-accent-500"
              />
            </label>
            <div role="tablist" aria-label="Settings sections" className="mt-4 grid grid-cols-2 gap-1 sm:block">
              {(["Personal", "Workspace"] as const).map((group) => {
                const items = visibleTabs.filter((item) => item.group === group);
                if (!items.length) return null;
                return (
                  <div key={group} className="col-span-2 sm:mb-4">
                    <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group}</p>
                    {items.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => selectTab(id)}
                        role="tab"
                        aria-selected={tab === id}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors ${
                          tab === id ? "bg-accent-500/15 text-white" : "text-slate-400 hover:bg-base-700/60 hover:text-slate-200"
                        }`}
                      >
                        <Icon size={16} className={tab === id ? "text-accent-300" : "text-slate-500"} />
                        <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              {visibleTabs.length === 0 && <p className="col-span-2 px-2 py-3 text-xs text-slate-500">No matching settings.</p>}
            </div>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
          {tab === "general" && (
            <div className="space-y-6">
              <div>
                <SectionLabel>Preferences</SectionLabel>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-300">Default model</label>
                    <Dropdown
                      matchWidth
                      menuClassName="max-h-80"
                      trigger={({ open, toggle }) => (
                        <button
                          onClick={toggle}
                          className="flex w-full items-center gap-2 rounded-lg border border-base-600/60 bg-base-900 px-3 py-2 text-sm text-white transition-colors hover:border-accent-500/50"
                        >
                          <ModelFavicon model={defaultModel} size={15} />
                          <span className="min-w-0 flex-1 truncate text-left">{defaultModel.displayName}</span>
                          <ChevronDown size={13} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
                        </button>
                      )}
                    >
                      {({ close }) => (
                        <div className="max-h-64 w-full overflow-y-auto py-1">
                          {getAllModels().map((m) => {
                            const locked = isModelGated(m) && !user;
                            const isSelected = defaultModel.modelId === m.modelId && defaultModel.provider === m.provider;
                            return (
                              <button
                                key={`${m.provider}:${m.modelId}`}
                                onClick={() => {
                                  if (locked) {
                                    signInWithGoogle();
                                    return;
                                  }
                                  if (m.provider === "puter" && !isPuterSignedIn()) {
                                    setPendingPuterModel(m);
                                    close();
                                    return;
                                  }
                                  updateSettings({ defaultModelId: m.modelId });
                                  close();
                                }}
                                className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-base-700/50 ${
                                  isSelected ? "bg-accent-500/10 font-medium text-white" : "text-slate-300"
                                }`}
                              >
                                <ModelFavicon model={m} size={15} />
                                <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                                {locked ? (
                                  <Lock size={12} className="shrink-0 text-slate-500" />
                                ) : (
                                  isSelected && <Check size={13} className="shrink-0 text-accent-400" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </Dropdown>
                    <p className="mt-1 text-xs text-slate-500">Used for new Direct/Agent/Side by Side chats.</p>
                  </div>

                  <ToggleSwitch
                    label="Send on Enter"
                    description="Off: Enter adds a newline, Ctrl/Cmd+Enter sends"
                    checked={settings.sendOnEnter}
                    onChange={(v) => updateSettings({ sendOnEnter: v })}
                  />
                  <ToggleSwitch
                    label="Auto-open code panel"
                    description="Detected coding requests open the workspace automatically"
                    checked={settings.autoOpenCode}
                    onChange={(v) => updateSettings({ autoOpenCode: v })}
                  />
                  <ToggleSwitch
                    label="Web search"
                    description="Lofin searches current topics automatically; asking it to browse or use a website always triggers a live search"
                    checked={settings.autoWebSearch}
                    onChange={(v) => updateSettings({ autoWebSearch: v })}
                  />
                </div>
              </div>

              <details className="group rounded-lg border border-base-700/60 bg-base-900/40 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white">
                  <Wrench size={14} className="text-slate-500" />
                  Advanced — Worker connection
                  <ChevronDown size={14} className="ml-auto text-slate-500 transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-4 border-t border-base-700/60 px-3 py-3.5">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-300">Worker URL</label>
                    <input
                      value={workerUrl}
                      onChange={(e) => setWorkerUrl(e.target.value)}
                      onBlur={() => updateSettings({ workerUrl: workerUrl.trim() })}
                      placeholder="https://lofin.your-subdomain.workers.dev"
                      className="w-full rounded-lg border border-base-600/60 bg-base-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      The Cloudflare Worker that proxies chat requests. Pre-filled for lofin.dev — only change this if
                      you're running your own.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-300">Access password (optional)</label>
                    <input
                      value={password}
                      type="password"
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => updateSettings({ password })}
                      placeholder="Only if the Worker has LOFIN_PASSWORD set"
                      className="w-full rounded-lg border border-base-600/60 bg-base-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={test}
                      disabled={!workerUrl.trim()}
                      className="rounded-lg border border-base-600/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-base-700/60 disabled:opacity-50"
                    >
                      Test connection
                    </button>
                    {status === "checking" && <Loader2 size={14} className="animate-spin text-slate-400" />}
                    {status === "ok" && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 size={13} /> Reachable
                      </span>
                    )}
                    {status === "fail" && (
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <XCircle size={13} /> Unreachable
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-300">Request spacing</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={60}
                        step={1}
                        value={settings.requestSpacingSec}
                        onChange={(e) => {
                          const n = Math.round(Number(e.target.value));
                          updateSettings({ requestSpacingSec: Number.isFinite(n) ? Math.min(60, Math.max(0, n)) : 0 });
                        }}
                        className="w-20 rounded-lg border border-base-600/60 bg-base-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500"
                      />
                      <span className="text-sm text-slate-400">seconds between requests</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Minimum gap between outgoing model requests. Helps stay under a provider's per-minute limit when
                      Battle, Side by Side, Agent Mode, or project broadcasts fire several at once. 0 = off.
                    </p>
                  </div>
                </div>
              </details>
            </div>
          )}

          {tab === "appearance" && <AppearanceSection />}
          {tab === "notifications" && (
            <div className="space-y-3">
              <SectionLabel>Notifications</SectionLabel>
              <ToggleSwitch label="Product announcements" description="Show new-release popups and keep updates in the Announcements tab" checked={settings.announcementsEnabled} onChange={(v) => updateSettings({ announcementsEnabled: v })} />
              <ToggleSwitch label="Notification sound" description="Play a short chime when a reply finishes" checked={settings.notificationSound} onChange={(v) => updateSettings({ notificationSound: v })} />
              <ToggleSwitch
                label="Browser notifications"
                description="Notify you when a reply finishes while Lofin is in the background"
                checked={settings.desktopNotifications}
                onChange={async (enabled) => {
                  if (!enabled) return updateSettings({ desktopNotifications: false });
                  updateSettings({ desktopNotifications: await requestDesktopNotificationPermission() });
                }}
              />
            </div>
          )}
          {tab === "personalization" && (
            <div className="space-y-5">
              <div>
                <SectionLabel>Custom instructions</SectionLabel>
                <textarea value={customSystemPrompt} onChange={(e) => setCustomSystemPrompt(e.target.value)} onBlur={() => updateSettings({ customSystemPrompt: customSystemPrompt.trim() })} maxLength={2000} rows={7} placeholder="e.g. Always answer in bullet points. I'm a backend engineer, skip basic explanations." className="w-full resize-y rounded-lg border border-base-600/60 bg-base-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500" />
                <p className="mt-1 text-xs text-slate-500">Added to every request, on top of Lofin's own instructions.</p>
              </div>
              <ToggleSwitch label="Show token counts" description="Print the estimated token count under each reply" checked={settings.showTokenCounts} onChange={(v) => updateSettings({ showTokenCounts: v })} />
            </div>
          )}
          {tab === "privacy" && (
            <div className="space-y-5">
              <div><SectionLabel>Privacy</SectionLabel><p className="text-sm text-slate-400">Control what contextual information Lofin can use to make replies more useful.</p></div>
              <ToggleSwitch
                label="Share approximate location"
                description="Lets Lofin give locally-relevant answers using a city-level estimate from your IP address — never exact GPS. Off by default."
                checked={settings.locationConsent === "granted"}
                onChange={(v) => updateSettings({ locationConsent: v ? "granted" : "denied" })}
              />
            </div>
          )}
          {tab === "account" && <AccountSection />}
          {tab === "models" && <CustomModelsSection />}
          {tab === "memory" && <MemorySection />}
          {tab === "storage" && <StorageSection />}
          {tab === "advanced" && (
            <div className="space-y-5">
              <div>
                <SectionLabel>Worker connection</SectionLabel>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Worker URL</label>
                <input value={workerUrl} onChange={(e) => setWorkerUrl(e.target.value)} onBlur={() => updateSettings({ workerUrl: workerUrl.trim() })} placeholder="https://lofin.your-subdomain.workers.dev" className="w-full rounded-lg border border-base-600/60 bg-base-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500" />
                <p className="mt-1 text-xs text-slate-500">Only change this when you run your own Cloudflare Worker.</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Access password (optional)</label>
                <input value={password} type="password" onChange={(e) => setPassword(e.target.value)} onBlur={() => updateSettings({ password })} placeholder="Only if the Worker has LOFIN_PASSWORD set" className="w-full rounded-lg border border-base-600/60 bg-base-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500" />
              </div>
              <button onClick={test} disabled={!workerUrl.trim()} className="rounded-lg border border-base-600/60 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-base-700/60 disabled:opacity-50">{status === "checking" ? "Testing…" : status === "ok" ? "Connection reachable" : status === "fail" ? "Connection unavailable" : "Test connection"}</button>
              <ToggleSwitch label="Auto-retry on rate limits" description="Wait out temporary rate limits and retry with backoff" checked={settings.autoRetryRateLimited} onChange={(v) => updateSettings({ autoRetryRateLimited: v })} />
            </div>
          )}
        </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-base-700/60 px-6 py-4">
          <div className="flex gap-3 text-xs text-slate-500">
            <a href="/about" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 hover:underline">
              About
            </a>
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 hover:underline">
              Privacy
            </a>
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 hover:underline">
              Terms
            </a>
          </div>
          <button
            onClick={commitAndClose}
            className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-base-950 hover:bg-accent-400"
          >
            Done
          </button>
        </div>
      </div>
    </div>
    {pendingPuterModel && (
      <PuterNoticeModal
        modelName={pendingPuterModel.displayName}
        onCancel={() => setPendingPuterModel(null)}
        onConfirm={() => {
          updateSettings({ defaultModelId: pendingPuterModel.modelId });
          setPendingPuterModel(null);
        }}
      />
    )}
    </>
  );
}
