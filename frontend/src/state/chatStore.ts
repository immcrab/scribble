import { create } from "zustand";
import type { Chat, ChatMessage, MemoryEntry, Mode, Vote } from "../types";
import { getDefaultModel, setCustomModels, setPuterFavorites } from "../config/models";
import { loadChats, saveChats, loadSettings, saveSettings, loadMemories, saveMemories, titleFromPrompt } from "../lib/storage";
import type { ScribbleSettings } from "../lib/storage";
import {
  startCloudSync,
  stopCloudSync,
  pushChatsToCloud,
  pushChatsPublic,
  pushSettingsToCloud,
  pushMemoriesToCloud,
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

interface ChatStore {
  chats: Chat[];
  activeChatId: string | null;
  sidebarOpen: boolean;
  settings: ScribbleSettings;
  memories: MemoryEntry[];
  abortControllers: Map<string, AbortController>;

  activeChat: () => Chat | undefined;

  createChat: (mode: Mode, modelId?: string) => string;
  setChatMode: (id: string, mode: Mode) => void;
  setActiveChat: (id: string) => void;
  deleteChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
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
  sidebarOpen: true,
  settings: initialSettings,
  memories: initialMemories,
  abortControllers: new Map(),

  activeChat: () => get().chats.find((c) => c.id === get().activeChatId),

  createChat: (mode, customModelId) => {
    const defaults = getDefaultModelPatch(mode, get().settings.defaultModelId);
    if (customModelId) defaults.modelId = customModelId;

    // Reuse an already-empty chat if one exists, rather than piling up empty
    // "New chat" entries every time the button is clicked without sending anything.
    const existing = get().chats.find((c) => c.messages.length === 0);
    if (existing) {
      set((s) => {
        const chats = s.chats.map((c) => (c.id === existing.id ? { ...c, mode, updatedAt: Date.now(), ...defaults } : c));
        debouncedPersist(chats);
        return { chats, activeChatId: existing.id };
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
      ...defaults,
    };
    set((s) => {
      const chats = [chat, ...s.chats];
      debouncedPersist(chats);
      return { chats, activeChatId: chat.id };
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

  setActiveChat: (id) => set({ activeChatId: id }),

  deleteChat: (id) => {
    set((s) => {
      const remaining = s.chats.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        const fresh = createInitialChat("direct");
        saveChats([fresh]);
        deleteChatFromCloud(id, [fresh]);
        return {
          chats: [fresh],
          activeChatId: fresh.id,
        };
      }
      saveChats(remaining);
      deleteChatFromCloud(id, remaining);
      return {
        chats: remaining,
        activeChatId: s.activeChatId === id ? remaining[0].id : s.activeChatId,
      };
    });
  },

  renameChat: (id, title) => {
    set((s) => {
      const chats = s.chats.map((c) => (c.id === id ? { ...c, title } : c));
      debouncedPersist(chats);
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
      () => ({ chats: get().chats, settings: get().settings, memories: get().memories }),
      (patch) => set(patch)
    );
  },
  stopCloudSync: () => stopCloudSync(),
}));
