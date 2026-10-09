import { useEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  Code2,
  RotateCw,
  Copy,
  Check,
  ExternalLink,
  Download,
  FileCode,
  Blocks,
  Folder,
  Globe2,
  LoaderCircle,
  Minus,
  X,
  Gamepad2,
  Sparkles,
} from "lucide-react";
import { useWorkspaceControls } from "./ChatWorkspaceSplit";
import type { Artifact } from "../lib/codeArtifact";
import type { Vote, ModelDef } from "../types";
import { Markdown } from "../lib/markdown";
import { ModelFavicon } from "./ProviderIcon";
import { publishWebsite, type PublishedWebsite } from "../lib/websiteClient";
import { useAuthStore } from "../state/authStore";
import { useChatStore } from "../state/chatStore";
import { BUILD_GAME_OPTIONS, buddyEmoji, type BuildGameId } from "../lib/playground";
import { GameCanvas } from "./BuildGames";
import { CodeBuddies } from "./CodeBuddies";

/** VS Code-ish per-extension tint so the file explorer reads at a glance. */
const EXT_COLORS: Record<string, string> = {
  js: "text-yellow-400",
  jsx: "text-yellow-400",
  mjs: "text-yellow-400",
  ts: "text-blue-400",
  tsx: "text-blue-400",
  html: "text-orange-400",
  htm: "text-orange-400",
  css: "text-sky-400",
  scss: "text-pink-400",
  json: "text-lime-400",
  py: "text-emerald-400",
  sh: "text-green-400",
  bash: "text-green-400",
  sql: "text-fuchsia-400",
  yml: "text-purple-400",
  yaml: "text-purple-400",
  md: "text-slate-400",
  go: "text-cyan-400",
  rs: "text-orange-500",
  rb: "text-red-400",
  php: "text-indigo-400",
  java: "text-red-400",
};

function extColor(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return EXT_COLORS[ext] ?? "text-slate-400";
}

/** Small stable identifier used to avoid re-uploading the same generated response on re-render. */
function artifactKey(artifact: Artifact): string {
  let hash = 2166136261;
  const input = artifact.files.map((file) => `${file.name}\0${file.content}`).join("\u0001");
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `lofin:website:${(hash >>> 0).toString(36)}`;
}

function artifactFileType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "html" || ext === "htm") return "text/html";
  if (ext === "css") return "text/css";
  if (ext === "js" || ext === "mjs") return "text/javascript";
  if (ext === "ts" || ext === "tsx") return "application/typescript";
  if (ext === "json") return "application/json";
  if (ext === "md") return "text/markdown";
  if (ext === "csv") return "text/csv";
  return "text/plain";
}

/**
 * Leading-edge + trailing-edge throttle: updates immediately if `intervalMs` has already
 * elapsed since the last update, otherwise schedules exactly one trailing update at the
 * boundary. Used to cap how often the (relatively expensive) syntax highlighter re-runs while
 * a code file is still streaming in, without ever falling more than `intervalMs` behind.
 */
function useThrottledValue<T>(value: T, intervalMs: number, active: boolean): T {
  const [out, setOut] = useState(value);
  const lastRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!active) {
      clearTimeout(timerRef.current);
      setOut(value);
      return;
    }
    const elapsed = Date.now() - lastRef.current;
    if (elapsed >= intervalMs) {
      lastRef.current = Date.now();
      setOut(value);
    } else {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        lastRef.current = Date.now();
        setOut(value);
      }, intervalMs - elapsed);
    }
    return () => clearTimeout(timerRef.current);
  }, [value, active, intervalMs]);

  return out;
}

/**
 * What the Preview tab shows while a website is still being written. Re-rendering the
 * half-written page into the iframe on every chunk made it flash constantly, so instead the
 * preview loads once when the code is done, and this screen (progress + a mini-game) fills
 * the wait. If the user is mid-game when the build finishes, it stays put with a
 * "View site" button rather than yanking the game away.
 */
function BuildScreen({
  artifact,
  ready,
  defaultGame,
  onPhaseChange,
  onViewSite,
}: {
  artifact: Artifact | null;
  ready: boolean;
  defaultGame: BuildGameId;
  onPhaseChange: (phase: "idle" | "playing" | "over") => void;
  onViewSite: () => void;
}) {
  const [game, setGame] = useState<BuildGameId>(defaultGame);
  useEffect(() => setGame(defaultGame), [defaultGame]);
  const lines = artifact?.files.reduce((n, f) => n + f.content.split("\n").length, 0) ?? 0;
  const current = artifact?.files[artifact.files.length - 1];

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-4 py-5">
      <div className="flex w-full max-w-[340px] items-center gap-2.5">
        {ready ? (
          <Sparkles size={16} className="shrink-0 text-emerald-300" />
        ) : (
          <LoaderCircle size={16} className="shrink-0 animate-spin text-slate-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-200">{ready ? "Your site is ready" : "Building your site…"}</p>
          <p className="truncate text-xs text-slate-500">
            {artifact
              ? `${artifact.files.length} file${artifact.files.length === 1 ? "" : "s"} · ${lines} lines${!ready && current ? ` · writing ${current.name}` : ""}`
              : "Waiting for the first lines of code"}
          </p>
        </div>
        {ready && (
          <button
            onClick={onViewSite}
            className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-white/90"
          >
            View site
          </button>
        )}
      </div>

      <div className="mt-4 flex w-full max-w-[340px] items-center gap-1 rounded-lg bg-base-850 p-0.5">
        {BUILD_GAME_OPTIONS.map((g) => (
          <button
            key={g.id}
            onClick={() => setGame(g.id)}
            title={g.note}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              game === g.id ? "bg-base-700 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {g.id === "none" ? "Off" : g.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex w-full flex-1 flex-col items-center justify-center">
        {game === "none" ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <Gamepad2 size={32} className="text-slate-600" />
            <p className="max-w-[260px] text-xs text-slate-500">
              The preview appears here once the code finishes. Pick a game above to pass the time.
            </p>
          </div>
        ) : (
          <GameCanvas game={game} onPhaseChange={onPhaseChange} />
        )}
      </div>
    </div>
  );
}

export interface WorkspacePane {
  key: "a" | "b" | "single";
  label: string;
  model?: ModelDef;
  artifact: Artifact | null;
  streaming: boolean;
}

export function ArtifactWorkspace({
  panes,
  vote,
  onVote,
}: {
  panes: WorkspacePane[];
  vote?: Vote;
  onVote?: (winner: Vote["winner"]) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [view, setView] = useState<"preview" | "code">("preview");
  const [activeFile, setActiveFile] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [published, setPublished] = useState<PublishedWebsite | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const controls = useWorkspaceControls();
  const user = useAuthStore((state) => state.user);
  const settings = useChatStore((state) => state.settings);
  const rootRef = useRef<HTMLDivElement>(null);
  const gamePhaseRef = useRef<"idle" | "playing" | "over">("idle");
  const [holdForGame, setHoldForGame] = useState(false);

  const pane = panes[Math.min(activeIndex, panes.length - 1)];
  const artifact = pane?.artifact ?? null;
  const file = artifact?.files[activeFile] ?? artifact?.files[0];

  // Highlighting the whole file on every streamed token would block the main thread on longer
  // files, so cap it to a few times a second while streaming — still visibly colored as it
  // writes, just not re-parsed on literally every chunk. Once the response finishes this
  // snaps straight to the final content (see the `active` arg).
  const throttledCode = useThrottledValue(file?.content ?? "", 200, !!pane?.streaming);

  // When the build finishes mid-game, keep the game on screen until the user chooses to
  // look at the site. Decided during render (not in an effect) so the game is never
  // unmounted for a frame in between, which would reset it.
  const streaming = !!pane?.streaming;
  const [prevStreaming, setPrevStreaming] = useState(streaming);
  if (prevStreaming !== streaming) {
    setPrevStreaming(streaming);
    setHoldForGame(!streaming && gamePhaseRef.current === "playing");
  }
  const onGamePhase = useRef((phase: "idle" | "playing" | "over") => {
    gamePhaseRef.current = phase;
  }).current;

  // Web pages (or a reply with no code parsed yet) get the build screen on the Preview tab
  // while streaming; other languages keep streaming straight into the code view.
  const showBuildScreen =
    view === "preview" && ((streaming && (!artifact || !!artifact.previewHtml)) || (holdForGame && !!artifact?.previewHtml));
  const buddy = buddyEmoji(settings.buildBuddy ?? "cat");

  const publishable = !!artifact?.previewHtml && !pane?.streaming;
  const currentArtifactKey = artifact && publishable ? artifactKey(artifact) : null;
  const completedArtifactKey = artifact && !pane?.streaming ? artifactKey(artifact) : null;

  const publish = async (force = false) => {
    if (!artifact || !artifact.previewHtml || pane?.streaming || publishing) return;
    const key = artifactKey(artifact);
    if (!user) {
      setPublishError("Sign in to publish this website.");
      return;
    }
    if (!force) {
      try {
        const saved = sessionStorage.getItem(key);
        if (saved) {
          setPublished(JSON.parse(saved) as PublishedWebsite);
          setPublishError(null);
          return;
        }
      } catch {
        // Session storage is optional; publishing still works in restricted browsers.
      }
    }
    setPublishing(true);
    setPublishError(null);
    try {
      const site = await publishWebsite(artifact.files);
      setPublished(site);
      try { sessionStorage.setItem(key, JSON.stringify(site)); } catch { /* non-essential */ }
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Could not publish website.");
    } finally {
      setPublishing(false);
    }
  };

  // A completed HTML artifact is a website request in practice. Publish it as
  // soon as it has finished streaming, while keeping a visible retry button if
  // the user is signed out or storage is temporarily unavailable.
  useEffect(() => {
    if (!currentArtifactKey || !user || publishing) return;
    void publish();
    // `currentArtifactKey` changes only when the response's files change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentArtifactKey, user?.uid]);

  // Keep the original source files for every completed AI artifact in the
  // private library. The stable id makes this safe to run after remounts, and
  // means a user can download the files even after a temporary website expires.
  useEffect(() => {
    if (!completedArtifactKey || !artifact || !user) return;
    const baseId = completedArtifactKey.replace("lofin:website:", "artifact-");
    void import("../lib/libraryClient").then(({ saveFileToStorage }) =>
      Promise.all(artifact.files.map((generated, index) =>
        saveFileToStorage(
          new File([generated.content], generated.name, { type: artifactFileType(generated.name) }),
          `${baseId}-${index}`,
          generated.name,
          { category: "file", prompt: "AI-generated file", model: pane?.model?.displayName },
        ).catch(() => undefined)
      ))
    );
  }, [completedArtifactKey, artifact, pane?.model?.displayName, user]);

  useEffect(() => {
    if (!currentArtifactKey) {
      setPublished(null);
      setPublishError(null);
      return;
    }
    try {
      const saved = sessionStorage.getItem(currentArtifactKey);
      setPublished(saved ? JSON.parse(saved) as PublishedWebsite : null);
    } catch {
      setPublished(null);
    }
  }, [currentArtifactKey]);

  const previewBlobUrl = useMemo(() => {
    if (!artifact?.previewHtml) return null;
    const blob = new Blob([artifact.previewHtml], { type: "text/html" });
    return URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact?.previewHtml, reloadKey]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(file?.content ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard blocked (insecure context or denied permission) — nothing to show.
    }
  };

  const openInNewTab = () => {
    if (previewBlobUrl) window.open(previewBlobUrl, "_blank", "noopener,noreferrer");
  };

  const downloadZip = async () => {
    if (!artifact) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const f of artifact.files) zip.file(f.name, f.content);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pane.label || "lofin-artifact"}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div ref={rootRef} className="relative flex h-full flex-col border-l border-base-700/60 bg-base-900/40">
      {showBuildScreen && buddy && !settings.reduceMotion && (
        <CodeBuddies containerRef={rootRef} emoji={buddy} count={settings.buildBuddyCount ?? 1} />
      )}
      {panes.length > 1 && (
        <div className="flex items-stretch border-b border-base-700/60">
          {panes.map((p, i) => (
            <div
              key={p.key}
              className={`flex flex-1 items-center justify-between gap-2 px-3 py-2 text-sm ${
                i === activeIndex ? "bg-base-850" : ""
              } ${i > 0 ? "border-l border-base-700/60" : ""}`}
            >
              <button
                onClick={() => {
                  setActiveIndex(i);
                  setActiveFile(0);
                }}
                className="flex min-w-0 items-center gap-2 text-slate-200"
              >
                {p.model ? (
                  <ModelFavicon model={p.model} size={14} />
                ) : (
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${i === activeIndex ? "bg-white" : "bg-base-600"}`} />
                )}
                <span className="truncate">{p.label}</span>
              </button>
              {onVote && (
                <button
                  onClick={() => onVote(p.key === "a" ? "a" : "b")}
                  disabled={!!vote}
                  className={`shrink-0 rounded-md px-2 py-1 text-xs transition-colors ${
                    vote?.winner === p.key
                      ? "bg-white text-base-950"
                      : "bg-base-800 text-slate-300 hover:bg-base-700 disabled:opacity-40"
                  }`}
                >
                  {vote?.winner === p.key ? "Voted" : `${p.key.toUpperCase()} is better`}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-base-700/60 px-2 py-1.5">
        <div className="flex items-center gap-1 rounded-lg bg-base-850 p-0.5">
          <button
            onClick={() => setView("preview")}
            disabled={!artifact?.previewHtml && !streaming}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-30 ${
              view === "preview" ? "bg-base-700 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Eye size={12} /> Preview
          </button>
          <button
            onClick={() => setView("code")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              view === "code" ? "bg-base-700 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Code2 size={12} /> Code
          </button>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-lg bg-base-900/60 px-2.5 py-1 text-xs text-slate-500">
          <button onClick={() => setReloadKey((k) => k + 1)} className="shrink-0 hover:text-white">
            <RotateCw size={12} />
          </button>
          <span className="truncate">/{file?.name ?? ""}</span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {publishable && (
            <div className="flex items-center gap-1">
              {published ? (
                <a
                  href={published.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`Published until ${new Date(published.expiresAt).toLocaleString()}`}
                  className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25"
                >
                  <Globe2 size={12} /> Live · 7 days
                </a>
              ) : (
                <button
                  onClick={() => void publish(true)}
                  disabled={publishing}
                  title={publishError ?? "Publish this temporary website"}
                  className="flex items-center gap-1 rounded-md bg-accent-500/15 px-2 py-1 text-xs font-medium text-accent-200 hover:bg-accent-500/25 disabled:opacity-60"
                >
                  {publishing ? <LoaderCircle size={12} className="animate-spin" /> : <Globe2 size={12} />}
                  {publishing ? "Publishing" : "Publish"}
                </button>
              )}
            </div>
          )}
          {view === "code" && (
            <button onClick={copyCode} title="Copy code" className="rounded-md p-1.5 text-slate-400 hover:bg-base-700/60 hover:text-white">
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          )}
          {artifact?.previewHtml && (
            <button onClick={openInNewTab} title="Open in new tab" className="rounded-md p-1.5 text-slate-400 hover:bg-base-700/60 hover:text-white">
              <ExternalLink size={13} />
            </button>
          )}
          <button
            onClick={downloadZip}
            disabled={!artifact}
            title="Download as .zip"
            className="flex items-center gap-1.5 rounded-md bg-base-700/60 px-2 py-1 text-xs font-medium text-slate-200 hover:bg-base-600/60 hover:text-white disabled:opacity-40"
          >
            <Download size={12} /> Download
          </button>
          {controls && (
            <>
              <button
                onClick={controls.minimize}
                title="Minimize"
                aria-label="Minimize code panel"
                className="rounded-md p-1.5 text-slate-400 hover:bg-base-700/60 hover:text-white"
              >
                <Minus size={14} />
              </button>
              <button
                onClick={controls.close}
                title="Close"
                aria-label="Close code panel"
                className="rounded-md p-1.5 text-slate-400 hover:bg-base-700/60 hover:text-white"
              >
                <X size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {publishable && (published || publishError) && (
        <div className={`border-b px-3 py-1.5 text-xs ${publishError ? "border-red-500/20 bg-red-500/5 text-red-200" : "border-emerald-500/20 bg-emerald-500/5 text-emerald-200"}`}>
          {published ? (
            <>Live for 7 days: <a href={published.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{published.url}</a></>
          ) : publishError}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {view === "code" && artifact && artifact.files.length > 1 && (
          <div className="flex w-44 shrink-0 flex-col overflow-y-auto border-r border-base-700/60 bg-base-900/60 py-1.5">
            <div className="flex items-center gap-1.5 px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <Folder size={11} /> Files
            </div>
            {artifact.files.map((f, i) => (
              <button
                key={f.name}
                onClick={() => setActiveFile(i)}
                title={f.name}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-left text-xs transition-colors ${
                  i === activeFile ? "bg-base-700/70 text-white" : "text-slate-400 hover:bg-base-800/60 hover:text-slate-200"
                }`}
              >
                <FileCode size={12} className={`shrink-0 ${extColor(f.name)}`} />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 min-w-0 flex-1">
          {showBuildScreen ? (
            <BuildScreen
              artifact={artifact}
              ready={!streaming}
              defaultGame={settings.buildGame ?? "snake"}
              onPhaseChange={onGamePhase}
              onViewSite={() => setHoldForGame(false)}
            />
          ) : !artifact ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Blocks size={36} className={pane?.streaming ? "animate-pulse text-slate-600" : "text-slate-700"} />
              <div>
                <p className="text-sm font-medium text-slate-300">{pane?.streaming ? "Building…" : "No code yet"}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {pane?.streaming
                    ? "Code will appear here as it's written."
                    : "The last reply had no code. Ask again, or hit Retry on the message."}
                </p>
              </div>
            </div>
          ) : view === "preview" && artifact.previewHtml ? (
            <iframe
              key={reloadKey}
              srcDoc={artifact.previewHtml}
              sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
              className="h-full w-full bg-white"
              title={pane.label}
            />
          ) : throttledCode.length > 60_000 ? (
            // Highlighting re-parses the whole file on every update — past this size even a
            // throttled pass is slow enough to feel laggy, so fall back to plain text.
            <div className="h-full overflow-auto p-3">
              <pre className="whitespace-pre-wrap break-words text-xs text-slate-300">{throttledCode}</pre>
            </div>
          ) : (
            <div className="h-full overflow-auto p-1">
              <Markdown content={`\`\`\`${file?.language ?? "text"}\n${throttledCode}\n\`\`\``} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
