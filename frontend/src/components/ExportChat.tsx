import { Download, Copy, Check, FileDown } from "lucide-react";
import { useState } from "react";
import type { ChatMessage as ChatMessageType } from "../types";

/**
 * Export the active conversation as a Markdown file (download) or copy the
 * plain-text transcript to the clipboard. Works offline — nothing leaves the
 * device.
 *
 * Touch-target note: every button here is min 44px tall and uses
 * `touch-action: manipulation` (see global CSS) so taps are instant on mobile.
 */
export function ExportChat({ messages, chatTitle }: { messages: ChatMessageType[]; chatTitle?: string }) {
  const [copied, setCopied] = useState(false);

  const toMarkdown = (): string => {
    const lines: string[] = [];
    lines.push(`# ${chatTitle || "Scribble AI Chat"}`);
    lines.push("");
    for (const m of messages) {
      const role = m.role.charAt(0).toUpperCase() + m.role.slice(1);
      const model = m.model?.displayName;
      lines.push(`## ${role}${model && m.role === "assistant" ? ` — ${model}` : ""}`);
      lines.push("");
      lines.push(m.content || "*(no content)*");
      lines.push("");
    }
    return lines.join("\n");
  };

  const download = () => {
    const md = toMarkdown();
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(chatTitle || "scribble-chat").replace(/[^a-z0-9]/gi, "_").toLowerCase() || "chat"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(toMarkdown());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={download}
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-base-800/60 text-slate-400 transition-colors hover:bg-base-700/60 hover:text-white sm:h-auto sm:w-auto sm:rounded-lg sm:px-2.5 sm:py-1.5"
        title="Export as Markdown"
      >
        <FileDown size={18} />
        <span className="hidden sm:inline">Export</span>
      </button>
      <button
        type="button"
        onClick={copyToClipboard}
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-base-800/60 text-slate-400 transition-colors hover:bg-base-700/60 hover:text-white sm:h-auto sm:w-auto sm:rounded-lg sm:px-2.5 sm:py-1.5"
        title="Copy transcript"
      >
        {copied ? <Check size={18} /> : <Copy size={18} />}
        <span className="hidden sm:inline">{copied ? "Copied!" : "Copy"}</span>
      </button>
    </div>
  );
}
