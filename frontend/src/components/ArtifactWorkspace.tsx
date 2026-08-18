import { useMemo, useState } from "react";
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
} from "lucide-react";
import type { Artifact } from "../lib/codeArtifact";
import type { Vote, ModelDef } from "../types";
import { Markdown } from "../lib/markdown";
import { ModelFavicon } from "./ProviderIcon";

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
          <span className="truncate">/{artifact?.files[0]?.name ?? ""}</span>
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

      {view === "code" && artifact && artifact.files.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-base-700/60 bg-base-900/40 px-2 py-1.5">
          {artifact.files.map((f, i) => (
            <button
              key={f.name}
              onClick={() => setActiveFile(i)}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
                i === activeFile ? "bg-base-700 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileCode size={11} /> {f.name}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1">
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
        ) : (
          <div className="h-full overflow-auto p-1">
            <Markdown content={`\`\`\`${file?.language ?? "text"}\n${file?.content ?? ""}\n\`\`\``} />
          </div>
        )}
      </div>
    </div>
  );
}
