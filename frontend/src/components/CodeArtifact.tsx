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
} from "lucide-react";
import type { Artifact } from "../lib/codeArtifact";
import { Markdown } from "../lib/markdown";

export function CodeArtifact({ artifact, title }: { artifact: Artifact; title: string }) {
  const [view, setView] = useState<"preview" | "code">(artifact.previewHtml ? "preview" : "code");
  const [activeFile, setActiveFile] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);

  const file = artifact.files[activeFile] ?? artifact.files[0];

  const previewBlobUrl = useMemo(() => {
    if (!artifact.previewHtml) return null;
    const blob = new Blob([artifact.previewHtml], { type: "text/html" });
    return URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact.previewHtml, reloadKey]);

  const copyCode = async () => {
    await navigator.clipboard.writeText(file?.content ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const openInNewTab = () => {
    if (previewBlobUrl) window.open(previewBlobUrl, "_blank", "noopener,noreferrer");
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    for (const f of artifact.files) zip.file(f.name, f.content);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "scribble-artifact"}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-base-700/60 bg-base-900/60">
      <div className="flex items-center justify-between gap-2 border-b border-base-700/60 px-2 py-1.5">
        <div className="flex items-center gap-1 rounded-lg bg-base-850 p-0.5">
          {artifact.previewHtml && (
            <button
              onClick={() => setView("preview")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                view === "preview" ? "bg-base-700 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Eye size={12} /> Preview
            </button>
          )}
          <button
            onClick={() => setView("code")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              view === "code" ? "bg-base-700 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Code2 size={12} /> Code
          </button>
        </div>

        <div className="flex items-center gap-1">
          {artifact.previewHtml && (
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              title="Reload preview"
              className="rounded-md p-1.5 text-slate-400 hover:bg-base-700/60 hover:text-white"
            >
              <RotateCw size={13} />
            </button>
          )}
          {view === "code" && (
            <button
              onClick={copyCode}
              title="Copy code"
              className="rounded-md p-1.5 text-slate-400 hover:bg-base-700/60 hover:text-white"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          )}
          {artifact.previewHtml && (
            <button
              onClick={openInNewTab}
              title="Open in new tab"
              className="rounded-md p-1.5 text-slate-400 hover:bg-base-700/60 hover:text-white"
            >
              <ExternalLink size={13} />
            </button>
          )}
          <button
            onClick={downloadZip}
            title="Download as .zip"
            className="flex items-center gap-1.5 rounded-md bg-base-700/60 px-2 py-1 text-xs font-medium text-slate-200 hover:bg-base-600/60 hover:text-white"
          >
            <Download size={12} /> Download
          </button>
        </div>
      </div>

      {view === "code" && artifact.files.length > 1 && (
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

      {view === "preview" && artifact.previewHtml ? (
        <iframe
          key={reloadKey}
          srcDoc={artifact.previewHtml}
          sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
          className="h-[420px] w-full bg-white"
          title={title}
        />
      ) : (
        <div className="max-h-[420px] overflow-auto p-1">
          <Markdown content={`\`\`\`${file?.language ?? "text"}\n${file?.content ?? ""}\n\`\`\``} />
        </div>
      )}
    </div>
  );
}
