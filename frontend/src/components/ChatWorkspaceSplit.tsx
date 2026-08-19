import { useState, type ReactNode } from "react";
import { MessageSquare, Code2 } from "lucide-react";

/**
 * The chat-column + ArtifactWorkspace-column split every mode renders once
 * code starts generating. Side by side works fine at desktop widths, but two
 * columns (one of them a live code/preview panel) can't coexist on a phone —
 * below `md` this swaps to a Chat/Code tab bar showing one full-width pane
 * at a time instead of squeezing both into a viewport neither fits in.
 */
export function ChatWorkspaceSplit({
  hasWorkspace,
  workspaceStreaming = false,
  chat,
  workspace,
}: {
  hasWorkspace: boolean;
  workspaceStreaming?: boolean;
  chat: ReactNode;
  workspace: ReactNode;
}) {
  const [mobilePane, setMobilePane] = useState<"chat" | "code">("chat");

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {hasWorkspace && (
        <div className="flex shrink-0 items-center gap-1 border-b border-base-700/60 bg-base-900/40 p-1.5 md:hidden">
          <button
            onClick={() => setMobilePane("chat")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors ${
              mobilePane === "chat" ? "bg-base-700 text-white" : "text-slate-400"
            }`}
          >
            <MessageSquare size={13} /> Chat
          </button>
          <button
            onClick={() => setMobilePane("code")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors ${
              mobilePane === "code" ? "bg-base-700 text-white" : "text-slate-400"
            }`}
          >
            <Code2 size={13} /> Code
            {workspaceStreaming && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400" />}
          </button>
        </div>
      )}

      <div
        className={`min-h-0 flex-col overflow-hidden ${
          hasWorkspace
            ? `${mobilePane === "chat" ? "flex" : "hidden"} md:flex md:w-full md:max-w-md md:shrink-0 md:border-r md:border-base-700/60`
            : "flex flex-1"
        }`}
      >
        {chat}
      </div>

      {hasWorkspace && (
        <div className={`min-h-0 min-w-0 flex-1 flex-col ${mobilePane === "code" ? "flex" : "hidden"} md:flex`}>{workspace}</div>
      )}
    </div>
  );
}
