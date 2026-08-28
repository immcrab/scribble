import { useEffect, useState } from "react";
import { Plus, X, FolderKanban, Radio } from "lucide-react";
import { useChatStore } from "../state/chatStore";
import { DirectMode } from "../modes/DirectMode";
import { Composer } from "./Composer";
import { sendDirectMessage } from "../lib/sendDirect";
import type { Attachment } from "../types";

/**
 * A project's workspace: a tab bar of the project's Direct-mode chats (one shown
 * at a time, the rest keep streaming in the background), plus a broadcast
 * composer that fires the same prompt into every chat at once. The visible chat
 * is rendered by the normal <DirectMode> — no duplicated chat UI here.
 */
export function ProjectView({ projectId }: { projectId: string }) {
  const project = useChatStore((s) => s.projects.find((p) => p.id === projectId));
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const settings = useChatStore((s) => s.settings);
  const { createChat, setActiveChat, deleteChat, renameProject } = useChatStore();

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  const projectChats = chats.filter((c) => c.projectId === projectId);
  const activeChat = projectChats.find((c) => c.id === activeChatId) ?? projectChats[0];

  // Keep the store's activeChatId pointed at a chat that's actually in this
  // project (deep links, deletions, cloud sync can all leave it stale).
  useEffect(() => {
    if (projectChats.length > 0 && activeChat && activeChat.id !== activeChatId) {
      setActiveChat(activeChat.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat?.id, activeChatId, projectChats.length]);

  if (!project) return null;

  const anyStreaming = projectChats.some((c) => c.messages.some((m) => m.streaming));

  const addChat = () => createChat("direct", undefined, projectId);

  const broadcast = (text: string, attachments: Attachment[]) => {
    projectChats.forEach((c) => sendDirectMessage(c.id, text, attachments));
  };

  const stopAll = () => {
    const { abort } = useChatStore.getState();
    for (const c of projectChats) {
      for (const m of c.messages) if (m.streaming) abort(m.id);
    }
  };

  const commitName = () => {
    if (nameValue.trim()) renameProject(projectId, nameValue.trim());
    setEditingName(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Project header */}
      <div className="flex items-center gap-2 border-b border-base-700/60 px-4 py-2.5">
        <FolderKanban size={16} className="shrink-0 text-accent-400" />
        {editingName ? (
          <input
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") setEditingName(false);
            }}
            onBlur={commitName}
            className="min-w-0 flex-1 rounded bg-base-900 px-1.5 py-1 text-sm font-semibold text-white outline-none ring-1 ring-accent-500"
          />
        ) : (
          <button
            onClick={() => {
              setNameValue(project.name);
              setEditingName(true);
            }}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-white hover:text-accent-300"
            title="Rename project"
          >
            {project.name}
          </button>
        )}
        <span className="shrink-0 text-[11px] text-slate-500">
          {projectChats.length} chat{projectChats.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-base-700/60 px-2 py-1.5">
        {projectChats.map((c) => {
          const streaming = c.messages.some((m) => m.streaming);
          return (
            <div
              key={c.id}
              className={`group flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                c.id === activeChat?.id
                  ? "bg-accent-500/15 text-white"
                  : "text-slate-400 hover:bg-base-800/70 hover:text-slate-200"
              }`}
            >
              <button onClick={() => setActiveChat(c.id)} className="max-w-[160px] truncate" title={c.title}>
                {c.title}
              </button>
              {streaming && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-400" />}
              <button
                onClick={() => deleteChat(c.id)}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-500 opacity-0 hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                title="Delete chat"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
        <button
          onClick={addChat}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-base-600/60 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-accent-500/50 hover:bg-base-700/60 hover:text-white"
          title="New chat in this project"
        >
          <Plus size={13} /> Chat
        </button>
      </div>

      {projectChats.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-slate-400">No chats in this project yet.</p>
          <button
            onClick={addChat}
            className="flex items-center gap-1.5 rounded-lg border border-base-600/60 bg-base-800/60 px-4 py-2 text-sm font-medium text-slate-200 hover:border-accent-500/50 hover:bg-base-700/60 hover:text-white"
          >
            <Plus size={15} /> Add a chat
          </button>
        </div>
      ) : (
        <>
          {/* Broadcast bar */}
          <div className="border-b border-base-700/60 bg-base-900/40 px-4 py-2.5 sm:px-8">
            <div className="mx-auto max-w-3xl">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                <Radio size={12} /> Broadcast to all {projectChats.length} chat{projectChats.length === 1 ? "" : "s"}
              </div>
              <Composer
                onSend={broadcast}
                onStop={stopAll}
                generating={anyStreaming}
                placeholder={`Send one prompt to all ${projectChats.length} chats...`}
                sendOnEnter={settings.sendOnEnter}
              />
            </div>
          </div>

          {activeChat && <DirectMode key={activeChat.id} chatId={activeChat.id} />}
        </>
      )}
    </div>
  );
}
