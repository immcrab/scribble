import { useState } from "react";
import { ShieldQuestion } from "lucide-react";
import { useChatStore } from "../state/chatStore";
import { executeComposioTool } from "../lib/mcpClient";
import type { ToolCallRecord } from "../types";

function updateToolCall(messageId: string, id: string, patch: Partial<ToolCallRecord>) {
  const store = useChatStore.getState();
  const chat = store.chats.find((c) => c.messages.some((m) => m.id === messageId));
  const message = chat?.messages.find((m) => m.id === messageId);
  if (!chat || !message?.toolCalls) return;
  store.updateMessage(chat.id, messageId, { toolCalls: message.toolCalls.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
}

/** Shown when Agent Mode prepared an action that changes something outside Lofin (sending an
 * email, posting a message…). Nothing runs until the user presses Approve for these arguments. */
export function McpApprovalCard({ toolCall, messageId }: { toolCall: ToolCallRecord; messageId: string }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const mcp = toolCall.mcp;
  if (!mcp) return null;

  const approve = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await executeComposioTool(mcp.toolId, mcp.arguments, mcp.confirmationToken);
      if (outcome.status === "executed") {
        updateToolCall(messageId, toolCall.id, { status: "done", output: "Approved and completed", mcp: undefined });
      } else {
        // The approval had expired: keep the card, swap in the fresh token, and ask again.
        updateToolCall(messageId, toolCall.id, { mcp: { ...mcp, confirmationToken: outcome.confirmationToken } });
        setNotice("That approval expired. Press Approve again to run it.");
      }
    } catch (err) {
      updateToolCall(messageId, toolCall.id, { status: "error", output: err instanceof Error ? err.message : "The action failed.", mcp: undefined });
    } finally {
      setBusy(false);
    }
  };

  const deny = () => updateToolCall(messageId, toolCall.id, { status: "error", output: "Declined. Nothing was changed.", mcp: undefined });

  return (
    <div className="mb-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
      <div className="flex items-center gap-2 font-medium text-amber-200"><ShieldQuestion size={14} />Approve this action?</div>
      <p className="mt-1 text-slate-300">{toolCall.name}</p>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-base-900/70 p-2 text-[11px] text-slate-300">{JSON.stringify(mcp.arguments, null, 2)}</pre>
      {notice && <p className="mt-2 text-amber-300">{notice}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={() => void approve()} disabled={busy} className="rounded-lg bg-accent-500 px-3 py-1.5 font-medium text-base-950 hover:bg-accent-400 disabled:opacity-50">{busy ? "Running…" : "Approve"}</button>
        <button onClick={deny} disabled={busy} className="rounded-lg border border-base-600/60 px-3 py-1.5 font-medium text-slate-200 hover:bg-base-700/60 disabled:opacity-50">Decline</button>
      </div>
    </div>
  );
}
