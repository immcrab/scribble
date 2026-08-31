import { Copy, Check, FileDown, ChevronDown, Link2 } from "lucide-react";
import { useState } from "react";
import { Dropdown } from "./Dropdown";
import type { ChatMessage as ChatMessageType } from "../types";

/**
 * Export the active conversation as a Markdown or JSON file (download), or copy
 * the plain-text transcript to the clipboard. Works offline — nothing leaves the
 * device.
 *
 * Touch-target note: every control here is min 44px tall and uses
 * `touch-action: manipulation` (see global CSS) so taps are instant on mobile.
 */
export function ExportChat({
  messages,
  chatTitle,
  chatId,
  canShare = false,
}: {
  messages: ChatMessageType[];
  chatTitle?: string;
  chatId?: string;
  /** Signed in — the chat is mirrored to a public "/c/{id}" copy, so a share link resolves. */
  canShare?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const shareLink = async () => {
    if (!chatId) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/c/${chatId}`);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      // ignore — clipboard unavailable
    }
  };

  const baseName = (chatTitle || "scribble-chat").replace(/[^a-z0-9]/gi, "_").toLowerCase() || "chat";

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

  const toJson = (): string =>
    JSON.stringify(
      {
        title: chatTitle || "Scribble AI Chat",
        exportedAt: new Date().toISOString(),
        messages: messages.map((m) => ({
          role: m.role,
          model: m.model?.displayName,
          content: m.content,
          reasoning: m.reasoning || undefined,
          createdAt: m.createdAt,
        })),
      },
      null,
      2
    );

  const downloadBlob = (text: string, mime: string, ext: string) => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.${ext}`;
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
      // ignore — clipboard unavailable
    }
  };

  const itemClass =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-base-700/50";

  return (
    <div className="flex flex-col gap-1.5">
    <div className="flex items-center gap-1.5">
      <Dropdown
        menuClassName="w-40"
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={toggle}
            className="flex h-11 items-center justify-center gap-1 rounded-xl bg-base-800/60 px-2.5 text-slate-400 transition-colors hover:bg-base-700/60 hover:text-white sm:h-auto sm:rounded-lg sm:py-1.5"
            title="Export chat"
          >
            <FileDown size={18} />
            <span className="hidden sm:inline">Export</span>
            <ChevronDown size={12} className="text-slate-500" />
          </button>
        )}
      >
        {({ close }) => (
          <>
            <button className={itemClass} onClick={() => { downloadBlob(toMarkdown(), "text/markdown", "md"); close(); }}>
              Markdown (.md)
            </button>
            <button className={itemClass} onClick={() => { downloadBlob(toJson(), "application/json", "json"); close(); }}>
              JSON (.json)
            </button>
          </>
        )}
      </Dropdown>
      <button
        type="button"
        onClick={copyToClipboard}
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-base-800/60 text-slate-400 transition-colors hover:bg-base-700/60 hover:text-white sm:h-auto sm:w-auto sm:rounded-lg sm:px-2.5 sm:py-1.5"
        title="Copy transcript"
        aria-label="Copy transcript to clipboard"
      >
        {copied ? <Check size={18} /> : <Copy size={18} />}
        <span className="hidden sm:inline">{copied ? "Copied!" : "Copy"}</span>
      </button>
      {canShare && chatId && (
        <button
          type="button"
          onClick={shareLink}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-base-800/60 text-slate-400 transition-colors hover:bg-base-700/60 hover:text-white sm:h-auto sm:w-auto sm:rounded-lg sm:px-2.5 sm:py-1.5"
          title="Copy a public link to this chat"
          aria-label="Copy a public link to this chat"
        >
          {shared ? <Check size={18} /> : <Link2 size={18} />}
          <span className="hidden sm:inline">{shared ? "Link copied" : "Share"}</span>
        </button>
      )}
    </div>
    {shared && (
      <p className="px-1 text-[11px] text-slate-500">Anyone with this link can view the conversation.</p>
    )}
    </div>
  );
}
