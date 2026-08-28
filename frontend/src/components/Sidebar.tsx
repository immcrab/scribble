import { useRef, useState } from "react";
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
  ShieldCheck,
  Gauge,
  FolderKanban,
  FolderPlus,
  FolderInput,
} from "lucide-react";
import { LogoMark } from "./Logo";
import { useChatStore } from "../state/chatStore";
import { useAuthStore } from "../state/authStore";
import { ExportChat } from "./ExportChat";
import { AdUnit } from "./AdUnit";
import { Dropdown } from "./Dropdown";
import { docsPath, adminPath, usagePath } from "../lib/router";
import { isAdmin } from "../lib/admin";
import type { Mode } from "../types";

function YouTubeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={(size * 20) / 28}
      viewBox="0 0 28 20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M27.4 3.1a3.5 3.5 0 0 0-2.46-2.48C22.76 0 14 0 14 0S5.24 0 3.06.62A3.5 3.5 0 0 0 .6 3.1 36.5 36.5 0 0 0 0 10a36.5 36.5 0 0 0 .6 6.9 3.5 3.5 0 0 0 2.46 2.48C5.24 20 14 20 14 20s8.76 0 10.94-.62a3.5 3.5 0 0 0 2.46-2.48A36.5 36.5 0 0 0 28 10a36.5 36.5 0 0 0-.6-6.9z"
        fill="#FF0000"
      />
      <path d="M11.2 14.29 18.53 10 11.2 5.71z" fill="#fff" />
    </svg>
  );
}

/** Hover-action menu on a History chat row: move the chat into one of the user's projects. */
function MoveToProjectMenu({ chatId }: { chatId: string }) {
  const projects = useChatStore((s) => s.projects);
  const moveChatToProject = useChatStore((s) => s.moveChatToProject);
  if (projects.length === 0) return null;
  return (
    <Dropdown
      align="right"
      menuClassName="w-44"
      trigger={({ toggle }) => (
        <button
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-600 hover:text-white"
          title="Add to project"
        >
          <FolderInput size={13} />
        </button>
      )}
    >
      {({ close }) => (
        <div className="py-1">
          <p className="px-3 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Add to project</p>
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                moveChatToProject(chatId, p.id);
                close();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-base-700/70 hover:text-white"
            >
              <FolderKanban size={13} className="shrink-0 opacity-70" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  );
}

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
  const {
    chats,
    activeChatId,
    sidebarOpen,
    toggleSidebar,
    setActiveChat,
    deleteChat,
    renameChat,
    createChat,
    projects,
    activeProjectId,
    createProject,
    renameProject,
    deleteProject,
    setActiveProject,
    moveChatToProject,
  } = useChatStore();
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuthStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [query, setQuery] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectEditValue, setProjectEditValue] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectDraft, setProjectDraft] = useState("");
  // Enter's keydown and the input's unmount-blur can both call commitNewProject in
  // the same tick with a stale `creatingProject` closure — this ref makes the commit
  // fire exactly once.
  const newProjectDoneRef = useRef(false);

  const startProjectEdit = (id: string, name: string) => {
    setEditingProjectId(id);
    setProjectEditValue(name);
  };
  const commitProjectEdit = () => {
    if (editingProjectId && projectEditValue.trim()) renameProject(editingProjectId, projectEditValue.trim());
    setEditingProjectId(null);
  };
  const openNewProject = () => {
    newProjectDoneRef.current = false;
    setProjectDraft("");
    setCreatingProject(true);
  };
  const commitNewProject = () => {
    if (newProjectDoneRef.current) return;
    newProjectDoneRef.current = true;
    setCreatingProject(false);
    if (projectDraft.trim()) createProject(projectDraft.trim());
    setProjectDraft("");
  };

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

  // Chats that belong to a project live inside that project's tabbed view, not the flat History list.
  const historyChats = chats.filter((c) => !c.projectId);

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
    ? historyChats.filter(
        (c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q))
      )
    : historyChats;

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

          {(sidebarOpen || mobileOpen) && (
            <div className="mt-4 px-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Projects</span>
                <button
                  onClick={openNewProject}
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-base-600 hover:text-white"
                  title="New project"
                >
                  <FolderPlus size={14} />
                </button>
              </div>

              {creatingProject && (
                <div className="mb-1 flex items-center gap-1">
                  <input
                    autoFocus
                    value={projectDraft}
                    onChange={(e) => setProjectDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitNewProject();
                      if (e.key === "Escape") {
                        newProjectDoneRef.current = true;
                        setCreatingProject(false);
                        setProjectDraft("");
                      }
                    }}
                    onBlur={commitNewProject}
                    placeholder="Project name"
                    className="min-w-0 flex-1 rounded bg-base-900 px-1.5 py-1 text-sm text-white outline-none ring-1 ring-accent-500 placeholder-slate-500"
                  />
                </div>
              )}

              {projects.length === 0 && !creatingProject && (
                <p className="px-1 py-1 text-[11px] text-slate-600">No projects yet</p>
              )}

              <ul className="space-y-1">
                {projects.map((p) => (
                  <li key={p.id}>
                    <div
                      className={`group flex items-center gap-1.5 rounded-lg border px-2 py-1 text-sm transition-all ${
                        p.id === activeProjectId
                          ? "border-accent-500/40 bg-accent-500/15 text-white shadow-sm"
                          : "border-base-700/50 bg-base-800/40 text-slate-400 hover:border-accent-500/40 hover:bg-base-700/60 hover:text-white"
                      }`}
                    >
                      <FolderKanban size={14} className="shrink-0 opacity-70" />
                      {editingProjectId === p.id ? (
                        <input
                          autoFocus
                          value={projectEditValue}
                          onChange={(e) => setProjectEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitProjectEdit();
                            if (e.key === "Escape") setEditingProjectId(null);
                          }}
                          onBlur={commitProjectEdit}
                          className="min-w-0 flex-1 rounded bg-base-900 px-1.5 py-1 text-sm text-white outline-none ring-1 ring-accent-500"
                        />
                      ) : (
                        <button
                          onClick={closeOnMobileSelect(() => setActiveProject(p.id))}
                          className="min-w-0 flex-1 truncate py-0.5 text-left"
                          title={p.name}
                        >
                          {p.name}
                        </button>
                      )}
                      {editingProjectId !== p.id && (
                        <span className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={() => startProjectEdit(p.id, p.name)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-base-600 hover:text-white"
                            title="Rename project"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => deleteProject(p.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-500/20 hover:text-red-400"
                            title="Delete project (keeps its chats)"
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

          {(sidebarOpen || mobileOpen) && historyChats.length > 0 && (
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
                    className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-base-600 hover:text-white"
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
            {historyChats.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-slate-500">No chats yet</p>
            )}
            {historyChats.length > 0 && filteredChats.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-slate-500">No chats match "{query.trim()}"</p>
            )}
            {filteredChats.length > 0 && (sidebarOpen || mobileOpen) && (
              <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {q ? `${filteredChats.length} result${filteredChats.length === 1 ? "" : "s"}` : "History"}
              </p>
            )}
            <ul className="space-y-1">
              {filteredChats.map((chat) => (
                <li key={chat.id}>
                  <div
                    className={`group flex items-center gap-1.5 rounded-lg border px-2 py-1 text-sm transition-all ${
                      chat.id === activeChatId
                        ? "border-accent-500/40 bg-accent-500/15 text-white shadow-sm"
                        : "border-base-700/50 bg-base-800/40 text-slate-400 hover:border-accent-500/40 hover:bg-base-700/60 hover:text-white"
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
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-600 hover:text-white"
                          title="Confirm"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-600 hover:text-white"
                          title="Cancel"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ) : (
                      <span className="opacity-0 group-hover:opacity-100 sm:group-hover:flex">
                        <span className="hidden sm:inline flex gap-1">
                          <MoveToProjectMenu chatId={chat.id} />
                          <button
                            onClick={() => startEdit(chat.id, chat.title)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-600 hover:text-white"
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
                          <MoveToProjectMenu chatId={chat.id} />
                          <button
                            onClick={() => startEdit(chat.id, chat.title)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-600 hover:text-white"
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
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 opacity-0 hover:bg-base-600 hover:text-white group-hover:opacity-100"
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
            {user && (
              <button
                onClick={closeOnMobileSelect(() => {
                  window.history.pushState(null, "", usagePath());
                  window.dispatchEvent(new PopStateEvent("popstate"));
                })}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-base-800/70 hover:text-white ${
                  !sidebarOpen && !mobileOpen && "md:justify-center"
                }`}
              >
                <Gauge size={16} />
                {(sidebarOpen || mobileOpen) && "Usage"}
              </button>
            )}
            {isAdmin(user) && (
              <button
                onClick={closeOnMobileSelect(() => {
                  window.history.pushState(null, "", adminPath());
                  window.dispatchEvent(new PopStateEvent("popstate"));
                })}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-base-800/70 hover:text-white ${
                  !sidebarOpen && !mobileOpen && "md:justify-center"
                }`}
              >
                <ShieldCheck size={16} />
                {(sidebarOpen || mobileOpen) && "Model admin"}
              </button>
            )}
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
              <YouTubeIcon size={18} />
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
