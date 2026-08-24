import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
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
} from "lucide-react";
import type { Artifact } from "../lib/codeArtifact";
import type { Vote, ModelDef } from "../types";
import { Markdown } from "../lib/markdown";
import { ModelFavicon } from "./ProviderIcon";

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

  const pane = panes[Math.min(activeIndex, panes.length - 1)];
  const artifact = pane?.artifact ?? null;
  const file = artifact?.files[activeFile] ?? artifact?.files[0];

  // Highlighting the whole file on every streamed token would block the main thread on longer
  // files, so cap it to a few times a second while streaming — still visibly colored as it
  // writes, just not re-parsed on literally every chunk. Once the response finishes this
  // snaps straight to the final content (see the `active` arg).
  const throttledCode = useThrottledValue(file?.content ?? "", 200, !!pane?.streaming);

  const previewBlobUrl = useMemo(() => {
    if (!artifact?.previewHtml) return null;
    const blob = new Blob([artifact.previewHtml], { type: "text/html" });
    return URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact?.previewHtml, reloadKey]);

  const copyCode = async () => {
    await navigator.clipboard.writeText(file?.content ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const openInNewTab = () => {
    if (previewBlobUrl) window.open(previewBlobUrl, "_blank", "noopener,noreferrer");
  };

  const downloadZip = async () => {
    if (!artifact) return;
    const zip = new JSZip();
    for (const f of artifact.files) zip.file(f.name, f.content);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pane.label || "scribble-artifact"}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col border-l border-base-700/60 bg-base-900/40">
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
            disabled={!artifact?.previewHtml}
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
        </div>
      </div>

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
          {!artifact ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Blocks size={36} className={pane?.streaming ? "animate-pulse text-slate-600" : "text-slate-700"} />
              <div>
                <p className="text-sm font-medium text-slate-300">{pane?.streaming ? "Building…" : "Nothing here yet"}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {pane?.streaming ? "Preview will appear when the response is done." : "Ask for something buildable to see it here."}
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
