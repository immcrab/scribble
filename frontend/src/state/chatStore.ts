import { create } from "zustand";
import type { Chat, ChatMessage, Mode, Vote } from "../types";
import { getDefaultModel, setCustomModels } from "../config/models";
import { loadChats, saveChats, loadSettings, saveSettings, titleFromPrompt } from "../lib/storage";
import type { ScribbleSettings } from "../lib/storage";
import { startCloudSync, stopCloudSync, pushChatsToCloud, pushSettingsToCloud } from "../lib/cloudSync";
import { uid } from "../lib/id";

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedPersist(chats: Chat[]) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    saveChats(chats);
    pushChatsToCloud(chats);
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

const loadedChats = loadChats();
const initialChats = loadedChats.length > 0 ? loadedChats : [createInitialChat("direct")];

interface ChatStore {
  chats: Chat[];
  activeChatId: string | null;
  sidebarOpen: boolean;
  settings: ScribbleSettings;
  abortControllers: Map<string, AbortController>;

  activeChat: () => Chat | undefined;

  createChat: (mode: Mode, modelId?: string) => string;
  setChatMode: (id: string, mode: Mode) => void;
  setActiveChat: (id: string) => void;
  deleteChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  setChatModels: (id: string, patch: Partial<Pick<Chat, "modelId" | "modelAId" | "modelBId">>) => void;
  maybeAutoTitle: (id: string, prompt: string) => void;

  addMessage: (chatId: string, message: ChatMessage) => void;
  updateMessage: (chatId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  appendMessageContent: (chatId: string, messageId: string, delta: string) => void;
  removeMessagesAfter: (chatId: string, messageId: string) => void;
  setVote: (chatId: string, vote: Vote) => void;

  toggleSidebar: () => void;
  updateSettings: (patch: Partial<ScribbleSettings>) => void;

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
  abortControllers: new Map(),

  activeChat: () => get().chats.find((c) => c.id === get().activeChatId),

  createChat: (mode, customModelId) => {
    const defaults = getDefaultModelPatch(mode, get().settings.defaultModelId);
    if (customModelId) defaults.modelId = customModelId;
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
        debouncedPersist([fresh]);
        return {
          chats: [fresh],
          activeChatId: fresh.id,
        };
      }
      debouncedPersist(remaining);
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

  maybeAutoTitle: (id, prompt) => {
    const chat = get().chats.find((c) => c.id === id);
    if (chat && chat.messages.length <= 1) {
      get().renameChat(id, titleFromPrompt(prompt));
    }
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
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, content: m.content + delta } : m
              ),
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
      saveSettings(settings);
      pushSettingsToCloud(settings);
      return { settings };
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
      () => ({ chats: get().chats, settings: get().settings }),
      (patch) => set(patch)
    );
  },
  stopCloudSync: () => stopCloudSync(),
}));
