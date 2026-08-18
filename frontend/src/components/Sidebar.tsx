import { useState } from "react";
import {
  PenLine,
  MessageSquare,
  Trash2,
  Pencil,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
  X,
} from "lucide-react";
import { useChatStore } from "../state/chatStore";
import type { Mode } from "../types";

const MODE_LABEL: Record<Mode, string> = {
  battle: "Battle",
  agent: "Agent",
  "side-by-side": "Side by Side",
  direct: "Direct",
};

export function Sidebar({
  onOpenSettings,
  mobileOpen,
  onCloseMobile,
}: {
  onOpenSettings: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { chats, activeChatId, sidebarOpen, toggleSidebar, setActiveChat, deleteChat, renameChat, createChat } =
    useChatStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = (id: string, title: string) => {
    setEditingId(id);
    setEditValue(title);
  };
  const commitEdit = () => {
    if (editingId && editValue.trim()) renameChat(editingId, editValue.trim());
    setEditingId(null);
  };

  const closeOnMobileSelect = (fn: () => void) => () => {
    fn();
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 animate-fade-in bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-40 h-full w-72 shrink-0 border-r border-base-700/60 glass-panel transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:relative md:z-auto md:translate-x-0 md:transition-[width] ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarOpen ? "md:w-72" : "md:w-[60px]"}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-3 py-4">
            {(sidebarOpen || mobileOpen) && (
              <div className="flex items-center gap-2 px-1 animate-fade-in">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 shadow-glow">
                  <PenLine size={15} className="text-white" strokeWidth={2.5} />
                </div>
                <span className="font-serif text-lg font-semibold tracking-tight text-white">Scribble</span>
              </div>
            )}
            <button
              onClick={() => {
                toggleSidebar();
                onCloseMobile();
              }}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-base-700/60 hover:text-white"
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            </button>
          </div>

          <div className="px-3">
            <button
              onClick={closeOnMobileSelect(() => createChat("direct"))}
              className={`flex w-full items-center gap-2 rounded-xl border border-base-600/60 bg-base-800/60 px-3 py-2.5 text-sm font-medium text-slate-200 transition-all hover:border-accent-500/50 hover:bg-base-700/60 hover:text-white ${
                !sidebarOpen && !mobileOpen && "md:justify-center"
              }`}
            >
              <PenLine size={16} className="text-accent-400" />
              {(sidebarOpen || mobileOpen) && "New Chat"}
            </button>
          </div>

          {(sidebarOpen || mobileOpen) && (
            <div className="mt-5 flex-1 overflow-y-auto px-2 pb-3 animate-fade-in">
              {chats.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-slate-500">No chats yet</p>
              )}
              {chats.length > 0 && (
                <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  History
                </p>
              )}
              <ul className="space-y-0.5">
                {chats.map((chat) => (
                  <li key={chat.id}>
                    <div
                      className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                        chat.id === activeChatId
                          ? "bg-accent-500/15 text-white"
                          : "text-slate-400 hover:bg-base-800/70 hover:text-slate-200"
                      }`}
                    >
                      <MessageSquare size={14} className="shrink-0 opacity-70" />
                      {editingId === chat.id ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="min-w-0 flex-1 rounded bg-base-900 px-1 text-sm text-white outline-none ring-1 ring-accent-500"
                        />
                      ) : (
                        <button
                          onClick={closeOnMobileSelect(() => setActiveChat(chat.id))}
                          className="min-w-0 flex-1 truncate text-left"
                          title={chat.title}
                        >
                          {chat.title}
                        </button>
                      )}
                      <span className="hidden shrink-0 text-[10px] text-slate-500 group-hover:hidden sm:inline">
                        {MODE_LABEL[chat.mode]}
                      </span>
                      {editingId === chat.id ? (
                        <span className="flex shrink-0 gap-0.5 opacity-100">
                          <button onClick={commitEdit} className="rounded p-1 hover:bg-base-700">
                            <Check size={12} />
                          </button>
                          <button onClick={() => setEditingId(null)} className="rounded p-1 hover:bg-base-700">
                            <X size={12} />
                          </button>
                        </span>
                      ) : (
                        <span className="hidden shrink-0 gap-0.5 group-hover:flex">
                          <button
                            onClick={() => startEdit(chat.id, chat.title)}
                            className="rounded p-1 text-slate-500 hover:bg-base-700 hover:text-white"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => deleteChat(chat.id)}
                            className="rounded p-1 text-slate-500 hover:bg-red-500/20 hover:text-red-400"
                          >
                            <Trash2 size={12} />
                          </button>
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!sidebarOpen && !mobileOpen && <div className="flex-1" />}

          <div className="border-t border-base-700/60 p-3">
            <button
              onClick={closeOnMobileSelect(onOpenSettings)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-base-800/70 hover:text-white ${
                !sidebarOpen && !mobileOpen && "md:justify-center"
              }`}
            >
              <Settings size={16} />
              {(sidebarOpen || mobileOpen) && "Settings"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
