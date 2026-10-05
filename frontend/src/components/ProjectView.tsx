import { useEffect, useState } from "react";
import { Plus, X, FolderKanban, Radio, FileText, ChevronDown, Trash2 } from "lucide-react";
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
  const { createChat, setActiveChat, deleteChat, renameProject, updateProjectBrief, addProjectReference, deleteProjectReference } = useChatStore();

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [briefDraft, setBriefDraft] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [referenceDraft, setReferenceDraft] = useState("");

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

  const openContext = () => {
    setBriefDraft(project.brief ?? "");
    setContextOpen((open) => !open);
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
        <button onClick={openContext} className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${contextOpen ? "bg-accent-500/15 text-accent-200" : "text-slate-500 hover:bg-base-800 hover:text-slate-300"}`} title="Project brief and references">
          <FileText size={15} />
        </button>
      </div>

      {contextOpen && (
        <section className="border-b border-base-700/60 bg-base-900/35 px-4 py-3 sm:px-8" aria-label="Project context">
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-300">Shared project brief</span><span className="text-[11px] text-slate-500">Used by every chat in this project</span></div>
            <textarea value={briefDraft} onChange={(e) => setBriefDraft(e.target.value)} onBlur={() => updateProjectBrief(projectId, briefDraft)} placeholder="Goals, audience, constraints, voice, or definitions for this project…" rows={3} className="w-full resize-y rounded-xl border border-base-700/60 bg-base-950/50 px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent-500/60" />
            <div className="mt-3 flex items-center gap-2"><span className="text-xs font-semibold text-slate-300">Reference notes</span><span className="text-[11px] text-slate-500">Up to 20 portable notes</span></div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[11rem_1fr_auto]">
              <input value={referenceName} onChange={(e) => setReferenceName(e.target.value)} placeholder="Name" className="rounded-lg border border-base-700/60 bg-base-950/50 px-2.5 py-2 text-sm text-slate-200 outline-none focus:border-accent-500/60" />
              <input value={referenceDraft} onChange={(e) => setReferenceDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addProjectReference(projectId, referenceName, referenceDraft); setReferenceName(""); setReferenceDraft(""); } }} placeholder="Paste a fact, style guide, or requirement…" className="rounded-lg border border-base-700/60 bg-base-950/50 px-2.5 py-2 text-sm text-slate-200 outline-none focus:border-accent-500/60" />
              <button onClick={() => { addProjectReference(projectId, referenceName, referenceDraft); setReferenceName(""); setReferenceDraft(""); }} disabled={!referenceDraft.trim()} className="rounded-lg border border-base-600/60 px-3 py-2 text-xs text-slate-300 hover:bg-base-800 disabled:opacity-40">Add</button>
            </div>
            {(project.references ?? []).length > 0 && <div className="mt-2 space-y-1.5">{project.references!.map((reference) => <div key={reference.id} className="flex items-start gap-2 rounded-lg border border-base-700/50 bg-base-950/35 px-2.5 py-2"><span className="min-w-0 flex-1 text-xs text-slate-400"><strong className="text-slate-300">{reference.name}</strong> · {reference.content}</span><button onClick={() => deleteProjectReference(projectId, reference.id)} title="Remove reference" className="text-slate-500 hover:text-red-400"><Trash2 size={13} /></button></div>)}</div>}
          </div>
        </section>
      )}

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
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 opacity-100 hover:bg-red-500/20 hover:text-red-400 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                title="Delete chat"
                aria-label={`Delete chat ${c.title}`}
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
