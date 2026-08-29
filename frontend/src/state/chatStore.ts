import { create } from "zustand";
import type { Chat, ChatMessage, MemoryEntry, Mode, Project, Vote } from "../types";
import { getDefaultModel, setCustomModels, setPuterFavorites } from "../config/models";
import {
  loadChats,
  saveChats,
  loadSettings,
  saveSettings,
  loadMemories,
  saveMemories,
  loadProjects,
  saveProjects,
  titleFromPrompt,
} from "../lib/storage";
import type { ScribbleSettings } from "../lib/storage";
import {
  startCloudSync,
  stopCloudSync,
  pushChatsToCloud,
  pushChatsPublic,
  pushSettingsToCloud,
  pushMemoriesToCloud,
  pushProjectsToCloud,
  deleteChatFromCloud,
} from "../lib/cloudSync";
import { generateChatTitle } from "../lib/workerClient";
import { uid } from "../lib/id";
import { estimateTokenCount } from "../lib/tokenCount";

/** Stored memory list is capped so it stays cheap to ship with every chat request
 * (see lib/clientContext.ts) and doesn't grow unbounded. */
const MAX_MEMORIES = 200;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedPersist(chats: Chat[]) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    saveChats(chats);
    pushChatsToCloud(chats);
    pushChatsPublic(chats);
  }, 250);
}

function getDefaultModelPatch(mode: Mode, overrideId?: string): Partial<Pick<Chat, "modelId" | "modelAId" | "modelBId">> {
  if (mode === "direct" || mode === "agent") {
    return { modelId: getDefaultModel(overrideId)?.modelId };
  }
  if (mode === "side-by-side") {
    return {
      modelAId: getDefaultModel(overrideId)?.modelId,
      modelBId: getDefaultModel(overrideId)?.modelId,
    };
  }
  return {};
}

function createInitialChat(mode: Mode = "direct"): Chat {
  return {
    id: uid(),
    title: "New chat",
    mode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    ...getDefaultModelPatch(mode, loadSettings().defaultModelId),
  };
}

const initialSettings = loadSettings();
setCustomModels(initialSettings.customModels);
setPuterFavorites(initialSettings.puterFavoriteModels);

const loadedChats = loadChats();
const initialChats = loadedChats.length > 0 ? loadedChats : [createInitialChat("direct")];
const initialMemories = loadMemories();
const initialProjects = loadProjects();

function persistProjects(projects: Project[]) {
  saveProjects(projects);
  pushProjectsToCloud(projects);
}

interface ChatStore {
  chats: Chat[];
  activeChatId: string | null;
  projects: Project[];
  activeProjectId: string | null;
  sidebarOpen: boolean;
  settings: ScribbleSettings;
  memories: MemoryEntry[];
  abortControllers: Map<string, AbortController>;

  activeChat: () => Chat | undefined;
  activeProject: () => Project | undefined;

  createChat: (mode: Mode, modelId?: string, projectId?: string) => string;
  setChatMode: (id: string, mode: Mode) => void;
  setActiveChat: (id: string) => void;
  deleteChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;

  createProject: (name: string) => string;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  moveChatToProject: (chatId: string, projectId: string | null) => void;
  setChatModels: (id: string, patch: Partial<Pick<Chat, "modelId" | "modelAId" | "modelBId">>) => void;
  patchChat: (id: string, patch: Partial<Chat>) => void;
  maybeAutoTitle: (id: string, prompt: string) => void;

  addMessage: (chatId: string, message: ChatMessage) => void;
  updateMessage: (chatId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  appendMessageContent: (chatId: string, messageId: string, delta: string) => void;
  appendMessageReasoning: (chatId: string, messageId: string, delta: string) => void;
  removeMessagesAfter: (chatId: string, messageId: string) => void;
  setVote: (chatId: string, vote: Vote) => void;

  toggleSidebar: () => void;
  updateSettings: (patch: Partial<ScribbleSettings>) => void;

  addMemory: (content: string) => void;
  deleteMemory: (id: string) => void;

  registerAbort: (key: string, controller: AbortController) => void;
  abort: (key: string) => void;
  abortAll: (chatId: string) => void;

  startCloudSync: (uid: string) => void;
  stopCloudSync: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: initialChats,
  activeChatId: initialChats[0]?.id ?? null,
  projects: initialProjects,
  activeProjectId: null,
  sidebarOpen: true,
  settings: initialSettings,
  memories: initialMemories,
  abortControllers: new Map(),

  activeChat: () => get().chats.find((c) => c.id === get().activeChatId),
  activeProject: () => get().projects.find((p) => p.id === get().activeProjectId),

  createChat: (mode, customModelId, projectId) => {
    const defaults = getDefaultModelPatch(mode, get().settings.defaultModelId);
    if (customModelId) defaults.modelId = customModelId;

    // Reuse an already-empty chat if one exists, rather than piling up empty
    // "New chat" entries every time the button is clicked without sending anything.
    // Scoped to the same project so opening a project doesn't recycle a stray
    // History draft into it (and vice versa).
    // A new chat that isn't in a project also drops us out of any open project view.
    const activeProjectId = projectId ?? null;

    const existing = get().chats.find((c) => c.messages.length === 0 && c.projectId === projectId);
    if (existing) {
      set((s) => {
        const chats = s.chats.map((c) =>
          c.id === existing.id ? { ...c, mode, updatedAt: Date.now(), projectId, ...defaults } : c
        );
        debouncedPersist(chats);
        return { chats, activeChatId: existing.id, activeProjectId };
      });
      return existing.id;
    }

    const chat: Chat = {
      id: uid(),
      title: "New chat",
      mode,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      projectId,
      ...defaults,
    };
    set((s) => {
      const chats = [chat, ...s.chats];
      debouncedPersist(chats);
      return { chats, activeChatId: chat.id, activeProjectId };
    });
    return chat.id;
  },

  setChatMode: (id, mode) => {
    set((s) => {
      const defaults = getDefaultModelPatch(mode, s.settings.defaultModelId);
      const chats = s.chats.map((c) => {
        if (c.id !== id) return c;
        return {
          ...c,
          mode,
          modelId: c.modelId ?? defaults.modelId,
          modelAId: c.modelAId ?? defaults.modelAId,
          modelBId: c.modelBId ?? defaults.modelBId,
        };
      });
      debouncedPersist(chats);
      return { chats };
    });
  },

  setActiveChat: (id) => {
    // Keep activeProjectId in lockstep: picking a project chat opens that project's
    // view; picking a History chat drops out of any project.
    const target = get().chats.find((c) => c.id === id);
    set({ activeChatId: id, activeProjectId: target?.projectId ?? null });
  },

  deleteChat: (id) => {
    // Keep the state update cheap so the sidebar drops the row on the same
    // frame as the click. The actual persistence (JSON.stringify of the whole
    // history + a synchronous localStorage write + the RTDB tombstone write)
    // is deferred to a macrotask so it can't block the repaint.
    let persist: (() => void) | null = null;
    set((s) => {
      const gone = s.chats.find((c) => c.id === id);
      const remaining = s.chats.filter((c) => c.id !== id);
      // When deleting the last chat inside a project, don't conjure a stray
      // History chat — just leave the project empty and let its view show the
      // "add a chat" affordance.
      if (remaining.length === 0 && !gone?.projectId) {
        const fresh = createInitialChat("direct");
        persist = () => {
          saveChats([fresh]);
          deleteChatFromCloud(id, [fresh]);
        };
        return {
          chats: [fresh],
          activeChatId: fresh.id,
          activeProjectId: null,
        };
      }
      persist = () => {
        saveChats(remaining);
        deleteChatFromCloud(id, remaining);
      };
      if (s.activeChatId !== id) return { chats: remaining };
      // Deleting the active chat: prefer another chat in the same project (stay in
      // its view, even if that leaves zero chats — the view handles empty), else
      // fall back to a History chat.
      if (gone?.projectId) {
        const nextInProject = remaining.find((c) => c.projectId === gone.projectId);
        return {
          chats: remaining,
          activeChatId: nextInProject?.id ?? null,
          activeProjectId: gone.projectId,
        };
      }
      const next = remaining.find((c) => !c.projectId) ?? remaining[0] ?? null;
      return {
        chats: remaining,
        activeChatId: next?.id ?? null,
        activeProjectId: next?.projectId ?? null,
      };
    });
    setTimeout(() => persist?.(), 0);
  },

  renameChat: (id, title) => {
    set((s) => {
      const chats = s.chats.map((c) => (c.id === id ? { ...c, title } : c));
      debouncedPersist(chats);
      return { chats };
    });
  },

  createProject: (name) => {
    const project: Project = { id: uid(), name: name.trim() || "New project", createdAt: Date.now(), updatedAt: Date.now() };
    set((s) => {
      const projects = [project, ...s.projects];
      persistProjects(projects);
      return { projects, activeProjectId: project.id, activeChatId: null };
    });
    return project.id;
  },

  renameProject: (id, name) => {
    set((s) => {
      const projects = s.projects.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name, updatedAt: Date.now() } : p));
      persistProjects(projects);
      return { projects };
    });
  },

  deleteProject: (id) => {
    set((s) => {
      const projects = s.projects.filter((p) => p.id !== id);
      persistProjects(projects);
      // Chats are never destroyed here — they drop back into the flat History list.
      const chats = s.chats.map((c) => (c.projectId === id ? { ...c, projectId: undefined, updatedAt: Date.now() } : c));
      const chatsChanged = chats.some((c, i) => c !== s.chats[i]);
      if (chatsChanged) debouncedPersist(chats);
      const leavingActive = s.activeProjectId === id;
      return {
        projects,
        chats,
        activeProjectId: leavingActive ? null : s.activeProjectId,
        activeChatId: leavingActive ? chats.find((c) => !c.projectId)?.id ?? null : s.activeChatId,
      };
    });
  },

  setActiveProject: (id) => {
    set((s) => {
      if (id === null) {
        const next = s.chats.find((c) => !c.projectId) ?? s.chats[0] ?? null;
        return { activeProjectId: null, activeChatId: next?.id ?? null };
      }
      const current = s.chats.find((c) => c.id === s.activeChatId);
      const stay = current && current.projectId === id;
      const first = s.chats.find((c) => c.projectId === id);
      return { activeProjectId: id, activeChatId: stay ? s.activeChatId : first?.id ?? null };
    });
  },

  moveChatToProject: (chatId, projectId) => {
    set((s) => {
      const chats = s.chats.map((c) =>
        c.id === chatId ? { ...c, projectId: projectId ?? undefined, updatedAt: Date.now() } : c
      );
      debouncedPersist(chats);
      // If the moved chat is the one on screen, follow it into (or out of) the project.
      if (s.activeChatId === chatId) return { chats, activeProjectId: projectId ?? null };
      return { chats };
    });
  },

  setChatModels: (id, patch) => {
    set((s) => {
      const chats = s.chats.map((c) => (c.id === id ? { ...c, ...patch } : c));
      debouncedPersist(chats);
      return { chats };
    });
  },

  patchChat: (id, patch) => {
    set((s) => {
      const chats = s.chats.map((c) => (c.id === id ? { ...c, ...patch } : c));
      debouncedPersist(chats);
      return { chats };
    });
  },

  maybeAutoTitle: (id, prompt) => {
    const chat = get().chats.find((c) => c.id === id);
    if (!chat || chat.messages.length > 1) return;

    const fallbackTitle = titleFromPrompt(prompt);
    get().renameChat(id, fallbackTitle);

    // Upgrade to an AI-generated title in the background; skip if the user
    // already renamed the chat themselves while this was in flight.
    const { workerUrl, password } = get().settings;
    void generateChatTitle(workerUrl, password, prompt).then((aiTitle) => {
      if (!aiTitle) return;
      const current = get().chats.find((c) => c.id === id);
      if (current && current.title === fallbackTitle) {
        get().renameChat(id, aiTitle);
      }
    });
  },

  addMessage: (chatId, message) => {
    set((s) => {
      const chats = s.chats.map((c) =>
        c.id === chatId
          ? { ...c, messages: [...c.messages, message], updatedAt: Date.now() }
          : c
      );
      debouncedPersist(chats);
      return { chats };
    });
  },

  updateMessage: (chatId, messageId, patch) => {
    set((s) => {
      const chats = s.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
              updatedAt: Date.now(),
            }
          : c
      );
      debouncedPersist(chats);
      return { chats };
    });
  },

  appendMessageContent: (chatId, messageId, delta) => {
    set((s) => {
      const chats = s.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) => {
                if (m.id !== messageId) return m;
                const content = m.content + delta;
                return { ...m, content, tokenCount: estimateTokenCount(content) + estimateTokenCount(m.reasoning ?? "") };
              }),
            }
          : c
      );
      debouncedPersist(chats);
      return { chats };
    });
  },

  appendMessageReasoning: (chatId, messageId, delta) => {
    set((s) => {
      const chats = s.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) => {
                if (m.id !== messageId) return m;
                const reasoning = (m.reasoning ?? "") + delta;
                return { ...m, reasoning, tokenCount: estimateTokenCount(reasoning) + estimateTokenCount(m.content) };
              }),
            }
          : c
      );
      debouncedPersist(chats);
      return { chats };
    });
  },

  removeMessagesAfter: (chatId, messageId) => {
    set((s) => {
      const chats = s.chats.map((c) => {
        if (c.id !== chatId) return c;
        const idx = c.messages.findIndex((m) => m.id === messageId);
        if (idx === -1) return c;
        return { ...c, messages: c.messages.slice(0, idx) };
      });
      debouncedPersist(chats);
      return { chats };
    });
  },

  setVote: (chatId, vote) => {
    set((s) => {
      const chats = s.chats.map((c) => (c.id === chatId ? { ...c, vote } : c));
      debouncedPersist(chats);
      return { chats };
    });
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  updateSettings: (patch) => {
    set((s) => {
      const settings = { ...s.settings, ...patch, updatedAt: Date.now() };
      setCustomModels(settings.customModels);
      setPuterFavorites(settings.puterFavoriteModels);
      saveSettings(settings);
      pushSettingsToCloud(settings);
      return { settings };
    });
  },

  addMemory: (content) => {
    set((s) => {
      const entry: MemoryEntry = { id: uid(), content, createdAt: Date.now() };
      const memories = [...s.memories, entry].slice(-MAX_MEMORIES);
      saveMemories(memories);
      pushMemoriesToCloud(memories);
      return { memories };
    });
  },

  deleteMemory: (id) => {
    set((s) => {
      const memories = s.memories.filter((m) => m.id !== id);
      saveMemories(memories);
      pushMemoriesToCloud(memories);
      return { memories };
    });
  },

  registerAbort: (key, controller) => {
    get().abortControllers.set(key, controller);
  },
  abort: (key) => {
    const c = get().abortControllers.get(key);
    c?.abort();
    get().abortControllers.delete(key);
  },
  abortAll: (chatId) => {
    for (const [key, controller] of get().abortControllers.entries()) {
      if (key.startsWith(chatId)) {
        controller.abort();
        get().abortControllers.delete(key);
      }
    }
  },

  startCloudSync: (uid) => {
    void startCloudSync(
      uid,
      () => ({ chats: get().chats, settings: get().settings, memories: get().memories, projects: get().projects }),
      (patch) => set(patch)
    );
  },
  stopCloudSync: () => stopCloudSync(),
}));
