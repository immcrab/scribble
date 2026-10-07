import { useState } from "react";
import { ExternalLink, ShieldQuestion } from "lucide-react";
import { useChatStore } from "../state/chatStore";
import { executeComposioTool } from "../lib/mcpClient";
import type { ToolCallRecord } from "../types";

function updateToolCall(messageId: string, id: string, patch: Partial<ToolCallRecord>) {
  const store = useChatStore.getState();
  const chat = store.chats.find((candidate) => candidate.messages.some((message) => message.id === messageId));
  const message = chat?.messages.find((candidate) => candidate.id === messageId);
  if (!chat || !message?.toolCalls) return;
  store.updateMessage(chat.id, messageId, { toolCalls: message.toolCalls.map((tool) => (tool.id === id ? { ...tool, ...patch } : tool)) });
}

/** Extract only absolute HTTPS URLs from a provider result. This keeps artifact opening useful
 * without trusting any result text as UI markup or exposing provider credentials. */
function artifactLinks(value: unknown, toolkit: string): NonNullable<ToolCallRecord["links"]> {
  const urls = new Set<string>();
  const presentationIds = new Set<string>();
  const visit = (candidate: unknown, depth = 0) => {
    if (depth > 5 || urls.size >= 8) return;
    if (typeof candidate === "string") {
      const matches = candidate.match(/https:\/\/[^\s"'<>]+/g) ?? [];
      for (const raw of matches) {
        try {
          const url = new URL(raw);
          if (url.protocol === "https:") urls.add(url.toString());
        } catch { /* Ignore provider text that only resembles a URL. */ }
      }
      return;
    }
    if (Array.isArray(candidate)) candidate.forEach((item) => visit(item, depth + 1));
    else if (candidate && typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate)) {
        // Google Slides creation responses sometimes return only a presentationId.
        // Turn that opaque identifier into the normal first-party URL locally; no
        // credentials or provider data are exposed to do this.
        if (toolkit === "googleslides" && /presentation_?id|presentationid/i.test(key) && typeof item === "string" && /^[A-Za-z0-9_-]{16,160}$/.test(item)) {
          presentationIds.add(item);
        }
        visit(item, depth + 1);
      }
    }
  };
  visit(value);
  for (const id of presentationIds) urls.add(`https://docs.google.com/presentation/d/${id}/edit`);
  const kind = toolkit === "googleslides" ? "presentation" : toolkit === "googledocs" ? "document" : undefined;
  const primary = kind === "presentation" ? "Open presentation" : kind === "document" ? "Open document" : "Open result";
  return [...urls].map((url, index) => ({ url, label: index === 0 ? primary : `${primary} ${index + 1}`, kind }));
}
/** Shown when Agent Mode prepared an action that changes something outside Lofin. */
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
        updateToolCall(messageId, toolCall.id, {
          status: "done",
          output: "Approved and completed",
          links: artifactLinks(outcome.result, mcp.toolkit),
          mcp: undefined,
        });
      } else {
        updateToolCall(messageId, toolCall.id, { mcp: { ...mcp, confirmationToken: outcome.confirmationToken } });
        setNotice("That approval expired. Press Approve again to run it.");
      }
    } catch (err) {
      updateToolCall(messageId, toolCall.id, { status: "error", output: err instanceof Error ? err.message : "The action failed.", mcp: undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
      <div className="flex items-center gap-2 font-medium text-amber-200"><ShieldQuestion size={14} />Approve this action?</div>
      <p className="mt-1 text-slate-300">{toolCall.name}</p>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-base-900/70 p-2 text-[11px] text-slate-300">{JSON.stringify(mcp.arguments, null, 2)}</pre>
      {notice && <p className="mt-2 text-amber-300">{notice}</p>}
      {toolCall.links?.length ? <div className="mt-3 flex flex-wrap gap-2">{toolCall.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-accent-500/40 px-2.5 py-1.5 font-medium text-accent-200 hover:bg-accent-500/10">{link.label}<ExternalLink size={12} /></a>)}</div> : null}
      <div className="mt-3 flex gap-2">
        <button onClick={() => void approve()} disabled={busy} className="rounded-lg bg-accent-500 px-3 py-1.5 font-medium text-base-950 hover:bg-accent-400 disabled:opacity-50">{busy ? "Running…" : "Approve"}</button>
        <button onClick={() => updateToolCall(messageId, toolCall.id, { status: "error", output: "Declined. Nothing was changed.", mcp: undefined })} disabled={busy} className="rounded-lg border border-base-600/60 px-3 py-1.5 font-medium text-slate-200 hover:bg-base-700/60 disabled:opacity-50">Decline</button>
      </div>
    </div>
  );
}