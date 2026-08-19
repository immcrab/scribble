import { useState } from "react";
import {
  Copy,
  Check,
  RotateCcw,
  User,
  HelpCircle,
  FileText,
  AlertTriangle,
  ChevronRight,
  Wrench,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { ChatMessage as ChatMessageType, ToolCallRecord } from "../types";
import { Markdown } from "../lib/markdown";
import { ModelFavicon } from "./ProviderIcon";
import { useLiveArtifact } from "../lib/useLiveArtifact";

const TOOL_STATUS_ICON: Record<ToolCallRecord["status"], typeof Loader2> = {
  pending: Loader2,
  running: Loader2,
  done: CheckCircle2,
  error: XCircle,
};

function ToolActivity({ toolCalls }: { toolCalls: ToolCallRecord[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-base-700/60 bg-base-900/50">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-slate-400 hover:text-slate-200"
      >
        <ChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        <Wrench size={12} />
        Agent activity ({toolCalls.length})
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-base-700/60 px-3 py-2">
          {toolCalls.map((t) => {
            const Icon = TOOL_STATUS_ICON[t.status];
            return (
              <div key={t.id} className="flex items-start gap-2 text-xs">
                <Icon
                  size={12}
                  className={`mt-0.5 shrink-0 ${
                    t.status === "running" || t.status === "pending" ? "animate-spin text-accent-400" : ""
                  } ${t.status === "done" ? "text-emerald-400" : ""} ${t.status === "error" ? "text-red-400" : ""}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-slate-300">{t.name}</span>
                  {t.output && <span className="block truncate text-slate-500">{t.output}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Rendered the instant a streaming turn begins — before the first token has
 * arrived from the backend. This is the "start spitting out a message before
 * it's actually even finished" cue: a live breathing cursor plus a "Responding…"
 * lead-in and a pulsing ellipsis, so the bubble feels alive rather than blank
 * while the upstream request is still warming up.
 */
function StreamingPrelude() {
  return (
    <div className="stream-prelude">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-500" />
      <span className="prelude-text">Responding…</span>
      <span className="thinking-dots">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

export function ChatMessage({
  message,
  hideModelName = false,
  onRegenerate,
  suppressCode = false,
}: {
  message: ChatMessageType;
  hideModelName?: boolean;
  onRegenerate?: () => void;
  /** True when a parent mode is already routing this message's code into the ArtifactWorkspace panel — keeps raw fences out of the bubble even mid-stream. */
  suppressCode?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const liveArtifact = useLiveArtifact(isUser ? undefined : message);
  // Finished artifact-worthy responses always redirect to the panel (as
  // before). Mid-stream, only redirect when the parent has confirmed this
  // message is already driving the workspace panel — avoids flashing the
  // "see the panel" swap for casual one-off code fences that never open one.
  const artifact = liveArtifact && (!message.streaming || suppressCode) ? liveArtifact : null;
  const lastFileName = artifact?.files[artifact.files.length - 1]?.name;

  return (
    <div className={`group animate-fade-in-up flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-shadow duration-300 ${
          isUser
            ? "bg-base-700 text-slate-300"
            : "border border-base-700/60 bg-base-900/90 shadow-sm"
        } ${!isUser && message.streaming ? "animate-avatar-glow shadow-glow border-accent-500/60" : ""}`}
      >
        {isUser ? (
          <User size={14} />
        ) : message.model && !hideModelName ? (
          <ModelFavicon model={message.model} size={15} />
        ) : (
          <HelpCircle size={14} className="text-slate-400" />
        )}
      </div>

      <div className={`min-w-0 max-w-[80%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {!isUser && (
          <div className="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium text-slate-400">
            {message.model && !hideModelName && <ModelFavicon model={message.model} size={12} />}
            <span>{hideModelName ? "Anonymous model" : message.model?.displayName ?? "Assistant"}</span>
          </div>
        )}

        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.attachments.map((a) => {
              const isImage = a.type?.startsWith("image/") || a.dataUrl?.startsWith("data:image/");
              if (isImage && a.dataUrl) {
                return (
                  <div
                    key={a.id}
                    className="group/img relative overflow-hidden rounded-xl border border-base-700/60 bg-base-900/80 shadow-sm"
                  >
                    <img
                      src={a.dataUrl}
                      alt={a.name}
                      className="max-h-56 max-w-full rounded-xl object-contain sm:max-h-72"
                      loading="lazy"
                    />
                    {a.name && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-base-950/80 to-transparent p-1.5 text-[11px] text-slate-300 opacity-0 transition-opacity group-hover/img:opacity-100 truncate">
                        {a.name}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <span
                  key={a.id}
                  className="flex items-center gap-1 rounded-lg border border-base-600/60 bg-base-800/60 px-2.5 py-1 text-xs text-slate-300"
                >
                  <FileText size={12} className="text-accent-400" /> {a.name}
                </span>
              );
            })}
          </div>
        )}

        <div
          className={`rounded-2xl px-4 py-2.5 transition-all duration-200 ${
            isUser
              ? "bg-accent-600/90 text-base-950"
              : "border border-base-700/60 bg-base-850/70 text-slate-100"
          } ${!isUser && message.streaming ? "border-accent-500/40" : ""}`}
        >
          {message.toolCalls && message.toolCalls.length > 0 && <ToolActivity toolCalls={message.toolCalls} />}
          {message.error ? (
            <div className="flex items-start gap-2 text-sm text-red-400">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{message.error}</span>
            </div>
          ) : artifact ? (
            <>
              {artifact.remainingText && <Markdown content={artifact.remainingText} />}
              {message.streaming ? (
                <div className="stream-prelude">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400" />
                  <span className="prelude-text">Writing {lastFileName ?? "code"}…</span>
                </div>
              ) : (
                !artifact.remainingText && <Markdown content="_Built the app — see the panel on the right._" />
              )}
            </>
          ) : message.content ? (
            <div className={message.streaming ? "stream-cursor" : ""}>
              <Markdown content={message.content} />
            </div>
          ) : message.streaming ? (
            <StreamingPrelude />
          ) : !isUser ? (
            <span className="text-sm italic text-slate-500">No response — try regenerating.</span>
          ) : null}
        </div>

        {!isUser && !message.streaming && message.content && (
          <div className="mt-1 flex gap-1 px-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:opacity-100">
            <button
              onClick={copy}
              className="flex items-center gap-1 rounded p-1 text-xs text-slate-500 transition-colors hover:bg-base-700/60 hover:text-white"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1 rounded p-1 text-xs text-slate-500 transition-colors hover:bg-base-700/60 hover:text-white"
              >
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
