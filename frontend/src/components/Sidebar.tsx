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
  LogIn,
  LogOut,
  Search,
  Download as ExportIcon,
  BookOpen,
  Youtube,
} from "lucide-react";
import { LogoMark } from "./Logo";
import { useChatStore } from "../state/chatStore";
import { useAuthStore } from "../state/authStore";
import { ExportChat } from "./ExportChat";
import { AdUnit } from "./AdUnit";
import { docsPath } from "../lib/router";
import type { Mode } from "../types";

const MODE_LABEL: Record<Mode, string> = {
  battle: "Battle",
  agent: "Agent",
  "side-by-side": "Side by Side",
  direct: "Direct",
  image: "Image",
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
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuthStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [query, setQuery] = useState("");

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

  const activeChat = chats.find((c) => c.id === activeChatId);

  const q = query.trim().toLowerCase();
  /** First message body that contains the search term, for the snippet shown
   * under a chat's title when the match isn't in the title itself. */
  const matchSnippet = (chat: (typeof chats)[number]): string | null => {
    if (!q) return null;
    for (const m of chat.messages) {
      const idx = m.content.toLowerCase().indexOf(q);
      if (idx !== -1) {
        const start = Math.max(0, idx - 20);
        const snippet = m.content.slice(start, idx + q.length + 40).trim();
        return start > 0 ? `…${snippet}` : snippet;
      }
    }
    return null;
  };
  const filteredChats = q
    ? chats.filter((c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)))
    : chats;

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
              <button
                onClick={closeOnMobileSelect(() => createChat("direct"))}
                title="New chat"
                className="flex items-center gap-2 rounded-lg px-1 py-0.5 animate-fade-in hover:opacity-80"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 shadow-glow">
                  <LogoMark size={15} className="text-base-950" />
                </div>
                <span className="font-serif text-lg font-semibold tracking-tight text-white">Scribble</span>
              </button>
            )}
            <button
              onClick={() => {
                toggleSidebar();
                onCloseMobile();
              }}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-base-700/60 hover:text-white sm:h-auto sm:w-auto sm:rounded-lg sm:p-2"
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

          {(sidebarOpen || mobileOpen) && chats.length > 0 && (
            <div className="mt-3 px-3">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search chats..."
                  className="w-full rounded-lg border border-base-600/60 bg-base-900/60 py-2 pl-8 pr-7 text-sm text-slate-200 outline-none placeholder-slate-500 focus:border-accent-500/50"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-base-700 hover:text-white"
                    title="Clear search"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mt-5 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
            {/* Active chat quick actions (Export) — always tappable */}
            {activeChat && (sidebarOpen || mobileOpen) && !q && (
              <div className="px-3 pb-3">
                <ExportChat messages={activeChat.messages} chatTitle={activeChat.title} />
              </div>
            )}
            {chats.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-slate-500">No chats yet</p>
            )}
            {chats.length > 0 && filteredChats.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-slate-500">No chats match "{query.trim()}"</p>
            )}
            {filteredChats.length > 0 && (sidebarOpen || mobileOpen) && (
              <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {q ? `${filteredChats.length} result${filteredChats.length === 1 ? "" : "s"}` : "History"}
              </p>
            )}
            <ul className="space-y-0.5">
              {filteredChats.map((chat) => (
                <li key={chat.id}>
                  <div
                    className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors ${
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
                        className="min-w-0 flex-1 rounded bg-base-900 px-1.5 py-1 text-sm text-white outline-none ring-1 ring-accent-500"
                      />
                    ) : (
                      <button
                        onClick={closeOnMobileSelect(() => setActiveChat(chat.id))}
                        className="min-w-0 flex-1 py-0.5 text-left"
                        title={chat.title}
                      >
                        <span className="block truncate">{chat.title}</span>
                        {q && !chat.title.toLowerCase().includes(q) && matchSnippet(chat) && (
                          <span className="block truncate text-[11px] text-slate-500">{matchSnippet(chat)}</span>
                        )}
                      </button>
                    )}
                    <span className="hidden shrink-0 text-[10px] text-slate-500 group-hover:hidden sm:inline">
                      {MODE_LABEL[chat.mode]}
                    </span>
                    {editingId === chat.id ? (
                      <span className="flex shrink-0 gap-1 opacity-100">
                        <button
                          onClick={commitEdit}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-700 hover:text-white"
                          title="Confirm"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-700 hover:text-white"
                          title="Cancel"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ) : (
                      <span className="opacity-0 group-hover:opacity-100 sm:group-hover:flex">
                        <span className="hidden sm:inline flex gap-1">
                          <button
                            onClick={() => startEdit(chat.id, chat.title)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-700 hover:text-white"
                            title="Rename"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => deleteChat(chat.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-500/20 hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </span>
                        <span className="sm:hidden flex gap-1">
                          <button
                            onClick={() => startEdit(chat.id, chat.title)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-700 hover:text-white"
                            title="Rename"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => deleteChat(chat.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-500/20 hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </span>
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {!sidebarOpen && !mobileOpen && <div className="flex-1" />}

          {(sidebarOpen || mobileOpen) && (
            <div className="px-3 pb-2">
              <AdUnit slot="0000000000" width={234} height={90} />
            </div>
          )}

          <div className="border-t border-base-700/60 p-3">
            {!authLoading && (
              <>
                {user ? (
                  <div
                    className={`group mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                      !sidebarOpen && !mobileOpen && "md:justify-center"
                    }`}
                  >
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="h-6 w-6 shrink-0 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-base-700 text-[11px] font-medium text-slate-200">
                        {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    {(sidebarOpen || mobileOpen) && (
                      <>
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-300">
                          {user.email ?? user.displayName}
                        </span>
                        <button
                          onClick={signOut}
                          title="Sign out"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 opacity-0 hover:bg-base-700 hover:text-white group-hover:opacity-100"
                        >
                          <LogOut size={13} />
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={signInWithGoogle}
                    className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-base-800/70 hover:text-white ${
                      !sidebarOpen && !mobileOpen && "md:justify-center"
                    }`}
                  >
                    <LogIn size={16} />
                    {(sidebarOpen || mobileOpen) && "Log in with Google"}
                  </button>
                )}
              </>
            )}
            <button
              onClick={closeOnMobileSelect(() => {
                window.history.pushState(null, "", docsPath());
                window.dispatchEvent(new PopStateEvent("popstate"));
              })}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-base-800/70 hover:text-white ${
                !sidebarOpen && !mobileOpen && "md:justify-center"
              }`}
            >
              <BookOpen size={16} />
              {(sidebarOpen || mobileOpen) && "Docs"}
            </button>
            <a
              href="https://www.youtube.com/channel/UC4C7A2I8hpmPwn4tvi4-JPQ?sub_confirmation=1"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onCloseMobile}
              title="Subscribe on YouTube"
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-base-800/70 hover:text-white ${
                !sidebarOpen && !mobileOpen && "md:justify-center"
              }`}
            >
              <Youtube size={16} className="text-red-500" />
              {(sidebarOpen || mobileOpen) && "Subscribe on YouTube"}
            </a>
            <button
              onClick={closeOnMobileSelect(onOpenSettings)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-base-800/70 hover:text-white ${
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
