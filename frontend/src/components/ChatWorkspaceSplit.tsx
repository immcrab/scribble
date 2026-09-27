import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { MessageSquare, Code2, ChevronsLeft } from "lucide-react";

/** Close / minimize handlers the split hands down to the ArtifactWorkspace toolbar. */
interface WorkspaceControls {
  close: () => void;
  minimize: () => void;
}

const WorkspaceControlsContext = createContext<WorkspaceControls | null>(null);

export function useWorkspaceControls(): WorkspaceControls | null {
  return useContext(WorkspaceControlsContext);
}

type PanelState = "open" | "minimized" | "closed";

/**
 * The chat-column + ArtifactWorkspace-column split every mode renders once
 * code starts generating. Side by side works fine at desktop widths, but two
 * columns (one of them a live code/preview panel) can't coexist on a phone —
 * below `md` this swaps to a Chat/Code tab bar showing one full-width pane
 * at a time instead of squeezing both into a viewport neither fits in.
 *
 * The panel can be minimized (collapses to a slim rail) or closed (hidden, with a
 * button in the chat column to bring it back). It re-opens on its own when a new
 * reply starts streaming code, so hiding it never hides fresh output.
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
  const [panel, setPanel] = useState<PanelState>("open");

  useEffect(() => {
    if (workspaceStreaming) setPanel("open");
  }, [workspaceStreaming]);

  const showPanel = hasWorkspace && panel === "open";

  const hide = (next: PanelState) => {
    setPanel(next);
    setMobilePane("chat");
  };
  const reopen = () => {
    setPanel("open");
    setMobilePane("code");
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
      {hasWorkspace && (
        <div className="flex shrink-0 items-center gap-1 border-b border-base-700/60 bg-base-900/40 p-1.5 md:hidden">
          <button
            onClick={() => setMobilePane("chat")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium transition-colors ${
              mobilePane === "chat" ? "bg-base-700 text-white" : "text-slate-400 hover:bg-base-800/60 hover:text-slate-200"
            }`}
          >
            <MessageSquare size={16} /> Chat
          </button>
          <button
            onClick={reopen}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium transition-colors ${
              mobilePane === "code" ? "bg-base-700 text-white" : "text-slate-400 hover:bg-base-800/60 hover:text-slate-200"
            }`}
          >
            <Code2 size={16} /> Code
            {workspaceStreaming && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400" />}
          </button>
        </div>
      )}

      <div
        className={`min-h-0 flex-col overflow-hidden ${
          showPanel
            ? `${mobilePane === "chat" ? "flex" : "hidden"} md:flex md:w-full md:max-w-md md:shrink-0 md:border-r md:border-base-700/60`
            : hasWorkspace
              ? `${mobilePane === "chat" ? "flex" : "hidden"} md:flex md:flex-1`
              : "flex flex-1"
        }`}
      >
        {chat}
      </div>

      {showPanel && (
        <div className={`min-h-0 min-w-0 flex-1 flex-col ${mobilePane === "code" ? "flex" : "hidden"} md:flex`}>
          <WorkspaceControlsContext.Provider value={{ close: () => hide("closed"), minimize: () => hide("minimized") }}>
            {workspace}
          </WorkspaceControlsContext.Provider>
        </div>
      )}

      {hasWorkspace && panel === "minimized" && (
        <button
          onClick={reopen}
          title="Expand code panel"
          className="hidden shrink-0 flex-col items-center gap-2 border-l border-base-700/60 bg-base-900/40 px-2.5 py-3 text-slate-400 transition-colors hover:bg-base-800/60 hover:text-white md:flex"
        >
          <ChevronsLeft size={16} />
          <Code2 size={16} />
          {workspaceStreaming && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400" />}
        </button>
      )}

      {hasWorkspace && panel === "closed" && (
        <button
          onClick={reopen}
          className="absolute bottom-24 right-4 z-10 hidden items-center gap-1.5 rounded-full border border-base-600/60 bg-base-800 px-3 py-1.5 text-xs font-medium text-slate-200 shadow-lg transition-colors hover:border-accent-500/50 hover:text-white md:flex"
        >
          <Code2 size={13} /> Show code
        </button>
      )}
    </div>
  );
}
