import { useEffect, useState } from "react";
import {
  Copy,
  Check,
  RotateCcw,
  ChevronDown,
  Edit3,
  User,
  HelpCircle,
  FileText,
  AlertTriangle,
  ChevronRight,
  Wrench,
  Loader2,
  CheckCircle2,
  XCircle,
  Send,
  X,
  Lock,
  Brain,
} from "lucide-react";
import type { ChatMessage as ChatMessageType, ToolCallRecord } from "../types";
import { Markdown } from "../lib/markdown";
import { ModelFavicon, ProviderFavicon } from "./ProviderIcon";
import { useLiveArtifact } from "../lib/useLiveArtifact";
import { modelsByProvider, PROVIDER_LABELS, isModelGated } from "../config/models";
import { useAuthStore } from "../state/authStore";
import { Dropdown } from "./Dropdown";

/** Small chevron-trigger dropdown next to Regenerate — lets you re-run the
 * same turn against a different model instead of the one that answered. */
function RegenerateWithMenu({ onPick }: { onPick: (modelId: string) => void }) {
  const grouped = modelsByProvider();
  const user = useAuthStore((s) => s.user);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  return (
    <Dropdown
      align="right"
      menuClassName="max-h-80 w-72"
      trigger={({ toggle }) => (
        <button
          onClick={toggle}
          className="message-action-btn flex items-center justify-center rounded p-1.5 text-xs text-slate-500 transition-colors hover:bg-base-700/60 hover:text-white"
          title="Regenerate with a different model"
        >
          <ChevronDown size={13} />
        </button>
      )}
    >
      {({ close }) => (
        <>
          {(Object.keys(grouped) as (keyof typeof grouped)[]).map((provider) => (
            <div key={provider} className="py-1.5 border-b border-base-700/40 last:border-b-0">
              <div className="flex items-center gap-1.5 px-3.5 pb-1 pt-1.5">
                <ProviderFavicon provider={provider} size={13} />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {PROVIDER_LABELS[provider]}
                </span>
              </div>
              {grouped[provider].map((m) => {
                const locked = isModelGated(m) && !user;
                return (
                  <button
                    key={m.modelId}
                    onClick={() => {
                      if (locked) {
                        signInWithGoogle();
                        return;
                      }
                      onPick(m.modelId);
                      close();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-base-700/50"
                  >
                    <ModelFavicon model={m} size={15} />
                    <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                    {locked && <Lock size={12} className="shrink-0 text-slate-500" />}
                  </button>
                );
              })}
            </div>
          ))}
        </>
      )}
    </Dropdown>
  );
}

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

/** Ticks once a second while `active`, so a live "Thinking for Ns" label stays
 * current without re-rendering the whole message tree on every token. */
function useElapsedMs(active: boolean, startedAt: number | undefined, frozenMs: number | undefined): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active || !startedAt) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active, startedAt]);
  if (frozenMs !== undefined) return Math.max(1, frozenMs);
  if (!startedAt) return 0;
  return Math.max(0, Date.now() - startedAt);
}

/** "1m 20s" past a minute; otherwise "4.27s" (precise) or "4s" (live tick) below it. */
function formatDuration(ms: number, precise: boolean): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const secs = Math.round(totalSeconds % 60);
    return `${minutes}m ${secs}s`;
  }
  if (precise) return `${totalSeconds.toFixed(2).replace(/^0\./, ".")}s`;
  return `${Math.round(totalSeconds)}s`;
}

/**
 * Rendered the instant a streaming turn begins — before the first real content
 * token has arrived. Shows a live "Thinking for Ns…" timer (ticking off
 * message.thinkingStartedAt) with a shimmering label, plus — for models that
 * stream a separate reasoning/thinking channel (see worker/src/adapters) — a
 * live-updating panel of that reasoning text. Once content starts arriving or
 * the turn ends, this collapses into a small "Thought for Xs" chip that
 * expands to show the full reasoning on demand.
 */
function ThinkingBlock({ message }: { message: ChatMessageType }) {
  const [expanded, setExpanded] = useState(false);
  const isThinking = !!message.streaming && !message.content;
  const hasReasoning = !!message.reasoning && message.reasoning.trim().length > 0;
  const elapsedMs = useElapsedMs(isThinking, message.thinkingStartedAt, isThinking ? undefined : message.thinkingMs);

  if (!isThinking && !hasReasoning) return null;

  if (isThinking) {
    return (
      <div className="mb-2">
        <div className="stream-prelude">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-500" />
          <span className="thinking-label animate-thinking-shimmer">
            {elapsedMs > 0 ? `Thinking for ${formatDuration(elapsedMs, false)}…` : "Thinking…"}
          </span>
          {!!message.tokenCount && <span className="text-xs text-slate-500">~{message.tokenCount} tokens</span>}
        </div>
        {hasReasoning && (
          <div className="mt-1.5 max-h-32 overflow-y-auto rounded-lg border border-base-700/40 bg-base-900/40 px-3 py-2 text-xs italic leading-relaxed text-slate-500 whitespace-pre-wrap">
            {message.reasoning}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-base-700/60 bg-base-900/50">
      <button
        onClick={() => setExpanded((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-slate-400 hover:text-slate-200"
      >
        <ChevronRight size={12} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
        <Brain size={12} />
        Thought for {formatDuration(elapsedMs, true)}
      </button>
      {expanded && (
        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap border-t border-base-700/60 px-3 py-2 text-xs italic leading-relaxed text-slate-500">
          {message.reasoning}
        </div>
      )}
    </div>
  );
}

export function ChatMessage({
  message,
  hideModelName = false,
  onRegenerate,
  onRegenerateWith,
  onEdit,
  suppressCode = false,
}: {
  message: ChatMessageType;
  hideModelName?: boolean;
  /** Resend the message with the same model. */
  onRegenerate?: () => void;
  /** Resend the message with a different model — omit to hide the model-picker chevron. */
  onRegenerateWith?: (modelId: string) => void;
  /** Edit & resend a user message. */
  onEdit?: (newText: string) => void;
  /** True when a parent mode is already routing this message's code into the ArtifactWorkspace panel — keeps raw fences out of the bubble even mid-stream. */
  suppressCode?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
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

  const startEdit = () => {
    setDraft(message.content);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft("");
  };
  const confirmEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onEdit?.(trimmed);
    setEditing(false);
    setDraft("");
  };

  return (
    <div className={`group animate-fade-in-up flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 ${
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

      <div className={`min-w-0 flex-1 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
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
                  className="flex items-center gap-1 rounded-lg border border-base-600/60 bg-base-800/60 px-2.5 py-1.5 text-xs text-slate-300"
                >
                  <FileText size={12} className="text-accent-400" /> {a.name}
                </span>
              );
            })}
          </div>
        )}

        {/* Message bubble — always editable/visible, never suppressed by hover */}
        <div
          className={`rounded-2xl px-4 py-2.5 break-words transition-all duration-200 ${
            isUser
              ? "bg-accent-600/90 text-base-950"
              : "border border-base-700/60 bg-base-850/70 text-slate-100"
          } ${!isUser && message.streaming ? "border-accent-500/40" : ""}`}
        >
          {message.toolCalls && message.toolCalls.length > 0 && <ToolActivity toolCalls={message.toolCalls} />}
          {!isUser && <ThinkingBlock message={message} />}
          {message.error ? (
            <div className="flex items-start gap-2 text-sm text-red-400">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{message.error}</span>
            </div>
          ) : editing ? (
            // Inline editor for user messages
            <div className="flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="w-full resize-y overflow-y-auto rounded-lg bg-base-950 px-2.5 py-1.5 text-sm text-slate-100 outline-none ring-1 ring-accent-500 placeholder-slate-500"
                placeholder="Edit your message…"
                autoFocus
              />
              <div className="flex gap-1.5 justify-end">
                <button
                  onClick={cancelEdit}
                  className="message-action-btn flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:bg-base-700/60 hover:text-white"
                  title="Cancel edit"
                >
                  <X size={13} />
                  Cancel
                </button>
                <button
                  onClick={confirmEdit}
                  className="message-action-btn flex items-center gap-1 rounded-lg bg-accent-500 px-2.5 py-1.5 text-xs font-medium text-base-950 transition-colors hover:bg-accent-400"
                  title="Send edited message"
                >
                  <Send size={13} />
                  Send
                </button>
              </div>
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
          ) : message.streaming ? null : !isUser ? (
            <span className="text-sm italic text-slate-500">No response — try regenerating.</span>
          ) : null}
        </div>

        {/* Token count — live estimate while generating, frozen once the turn ends.
            Hidden during the pure "Thinking…" phase, where ThinkingBlock shows it instead. */}
        {!isUser && !!message.tokenCount && (!message.streaming || !!message.content) && (
          <div className="mt-1 px-1 text-[11px] text-slate-500">
            {message.streaming ? `~${message.tokenCount} tokens` : `${message.tokenCount} tokens`}
          </div>
        )}

        {/* Action buttons — always visible on touch devices via CSS (see index.css),
            shown on hover for mouse. Made large enough for tappable use. */}
        {!isUser && !message.streaming && message.content && (
          <div className="mt-1 flex gap-1 px-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:opacity-100 sm:group-hover:opacity-100">
            <button
              onClick={copy}
              className="message-action-btn flex items-center gap-1 rounded p-1.5 text-xs text-slate-500 transition-colors hover:bg-base-700/60 hover:text-white"
              title="Copy"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="message-action-btn flex items-center gap-1 rounded p-1.5 text-xs text-slate-500 transition-colors hover:bg-base-700/60 hover:text-white"
                title="Regenerate"
              >
                <RotateCcw size={13} />
              </button>
            )}
            {onRegenerateWith && <RegenerateWithMenu onPick={onRegenerateWith} />}
          </div>
        )}

        {/* Edit button for user messages — always tappable on touch */}
        {isUser && !message.streaming && (
          <div className="mt-1 flex gap-1 px-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:opacity-100 sm:group-hover:opacity-100">
            {onEdit && (
              <button
                onClick={startEdit}
                className="message-action-btn flex items-center gap-1 rounded p-1.5 text-xs text-slate-500 transition-colors hover:bg-base-700/60 hover:text-white"
                title="Edit message"
              >
                <Edit3 size={13} />
              </button>
            )}
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="message-action-btn flex items-center gap-1 rounded p-1.5 text-xs text-slate-500 transition-colors hover:bg-base-700/60 hover:text-white"
                title="Resend"
              >
                <Send size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
