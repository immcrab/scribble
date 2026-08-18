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
import { ModelIcon } from "./ModelSelector";

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

export function ChatMessage({
  message,
  hideModelName = false,
  onRegenerate,
}: {
  message: ChatMessageType;
  hideModelName?: boolean;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className={`group animate-fade-in-up flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          isUser ? "bg-base-700 text-slate-300" : "bg-gradient-to-br from-accent-500 to-accent-700 text-white"
        }`}
      >
        {isUser ? (
          <User size={14} />
        ) : message.model && !hideModelName ? (
          <ModelIcon name={message.model.icon} size={14} />
        ) : (
          <HelpCircle size={14} />
        )}
      </div>

      <div className={`min-w-0 max-w-[80%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {!isUser && (
          <span className="mb-1 px-1 text-xs font-medium text-slate-500">
            {hideModelName ? "Anonymous model" : message.model?.displayName ?? "Assistant"}
          </span>
        )}

        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {message.attachments.map((a) => (
              <span
                key={a.id}
                className="flex items-center gap-1 rounded-lg border border-base-600/60 bg-base-800/60 px-2 py-1 text-xs text-slate-400"
              >
                <FileText size={11} /> {a.name}
              </span>
            ))}
          </div>
        )}

        <div
          className={`rounded-2xl px-4 py-2.5 ${
            isUser
              ? "bg-accent-600/90 text-white"
              : "border border-base-700/60 bg-base-850/70 text-slate-100"
          }`}
        >
          {message.toolCalls && message.toolCalls.length > 0 && <ToolActivity toolCalls={message.toolCalls} />}
          {message.error ? (
            <div className="flex items-start gap-2 text-sm text-red-400">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{message.error}</span>
            </div>
          ) : message.content ? (
            <div className={message.streaming ? "stream-cursor" : ""}>
              <Markdown content={message.content} />
            </div>
          ) : message.streaming ? (
            <div className="flex gap-1 py-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-500" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-500 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-500 [animation-delay:300ms]" />
            </div>
          ) : null}
        </div>

        {!isUser && !message.streaming && message.content && (
          <div className="mt-1 flex gap-1 px-1 opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100">
            <button
              onClick={copy}
              className="flex items-center gap-1 rounded p-1 text-xs text-slate-500 hover:bg-base-700/60 hover:text-white"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1 rounded p-1 text-xs text-slate-500 hover:bg-base-700/60 hover:text-white"
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
