import { create } from "zustand";
import type { Chat, ChatMessage, Mode, Vote } from "../types";
import { loadChats, saveChats, loadSettings, saveSettings, titleFromPrompt } from "../lib/storage";
import type { ScribbleSettings } from "../lib/storage";
import { uid } from "../lib/id";

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedPersist(chats: Chat[]) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => saveChats(chats), 250);
}

interface ChatStore {
  chats: Chat[];
  activeChatId: string | null;
  sidebarOpen: boolean;
  settings: ScribbleSettings;
  abortControllers: Map<string, AbortController>;

  activeChat: () => Chat | undefined;

  createChat: (mode: Mode) => string;
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
}

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: loadChats(),
  activeChatId: null,
  sidebarOpen: true,
  settings: loadSettings(),
  abortControllers: new Map(),

  activeChat: () => get().chats.find((c) => c.id === get().activeChatId),

  createChat: (mode) => {
    const chat: Chat = {
      id: uid(),
      title: "New chat",
      mode,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    set((s) => {
      const chats = [chat, ...s.chats];
      debouncedPersist(chats);
      return { chats, activeChatId: chat.id };
    });
    return chat.id;
  },

  setActiveChat: (id) => set({ activeChatId: id }),

  deleteChat: (id) => {
    set((s) => {
      const chats = s.chats.filter((c) => c.id !== id);
      debouncedPersist(chats);
      return {
        chats,
        activeChatId: s.activeChatId === id ? null : s.activeChatId,
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
      const settings = { ...s.settings, ...patch };
      saveSettings(settings);
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
}));
