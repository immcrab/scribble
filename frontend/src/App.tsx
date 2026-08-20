import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ModeSelector } from "./components/ModeSelector";
import { Composer } from "./components/Composer";
import { EmptyState } from "./components/EmptyState";
import { SettingsModal } from "./components/SettingsModal";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { ConsentGate } from "./components/ConsentGate";
import { hasAcceptedTerms } from "./lib/storage";
import { applyTheme, watchSystemTheme } from "./lib/theme";
import { DirectMode } from "./modes/DirectMode";
import { BattleMode } from "./modes/BattleMode";
import { SideBySideMode } from "./modes/SideBySideMode";
import { AgentMode } from "./modes/AgentMode";
import { ImageMode } from "./modes/ImageMode";
import { useChatStore } from "./state/chatStore";
import type { Attachment, Mode } from "./types";

export interface InitialPrompt {
  chatId: string;
  prompt: string;
  attachments: Attachment[];
  codeMode?: boolean;
}

export default function App() {
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const settings = useChatStore((s) => s.settings);
  const activeChat = chats.find((c) => c.id === activeChatId);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, setPending] = useState<InitialPrompt | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accepted, setAccepted] = useState(hasAcceptedTerms);

  useEffect(() => {
    applyTheme(settings.theme);
    watchSystemTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    if (!activeChat) {
      if (chats.length > 0) {
        useChatStore.getState().setActiveChat(chats[0].id);
      } else {
        useChatStore.getState().createChat("direct");
      }
    }
  }, [activeChat, chats]);

  const startChat = (prompt: string, attachments: Attachment[], codeMode?: boolean) => {
    const id = useChatStore.getState().createChat("direct");
    setPending({ chatId: id, prompt, attachments, codeMode });
  };

  const switchMode = (mode: Mode) => {
    if (activeChat) {
      if (activeChat.messages.length === 0) {
        useChatStore.getState().setChatMode(activeChat.id, mode);
      } else if (mode !== activeChat.mode) {
        useChatStore.getState().createChat(mode);
      }
    } else {
      useChatStore.getState().createChat(mode);
    }
  };

  const initialFor = (chatId: string) => (pending?.chatId === chatId ? pending : undefined);
  const consumeInitial = () => setPending(null);

  if (!accepted) {
    return <ConsentGate onAccept={() => setAccepted(true)} />;
  }

  return (
    <div className={`flex h-dvh w-full overflow-hidden bg-base-950 ${settings.reduceMotion ? "motion-reduce-force" : ""}`}>
      <Sidebar
        onOpenSettings={() => setSettingsOpen(true)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 flex-wrap items-center gap-2 px-4 py-2.5">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-base-700/60 hover:text-white md:hidden sm:h-auto sm:w-auto sm:rounded-lg sm:p-2"
            title="Open menu"
          >
            <Menu size={19} />
          </button>
          <ModeSelector mode={activeChat?.mode ?? "direct"} onChange={switchMode} />
        </div>

        <div className="min-h-0 flex-1">
          {!activeChat && (
            <div className="flex h-full flex-col">
              <div className="flex-1">
                <EmptyState onPick={(p) => startChat(p, [])} />
              </div>
              <div className="mx-auto w-full max-w-3xl px-4 pb-8 sm:px-8">
                <Composer onSend={startChat} generating={false} autoFocus sendOnEnter={settings.sendOnEnter} />
              </div>
            </div>
          )}
          {activeChat?.mode === "direct" && (
            <DirectMode
              key={activeChat.id}
              chatId={activeChat.id}
              initialPrompt={initialFor(activeChat.id)}
              onConsumeInitial={consumeInitial}
            />
          )}
          {activeChat?.mode === "battle" && (
            <BattleMode
              key={activeChat.id}
              chatId={activeChat.id}
              initialPrompt={initialFor(activeChat.id)}
              onConsumeInitial={consumeInitial}
            />
          )}
          {activeChat?.mode === "side-by-side" && (
            <SideBySideMode
              key={activeChat.id}
              chatId={activeChat.id}
              initialPrompt={initialFor(activeChat.id)}
              onConsumeInitial={consumeInitial}
            />
          )}
          {activeChat?.mode === "agent" && (
            <AgentMode
              key={activeChat.id}
              chatId={activeChat.id}
              initialPrompt={initialFor(activeChat.id)}
              onConsumeInitial={consumeInitial}
            />
          )}
          {activeChat?.mode === "image" && (
            <ImageMode
              key={activeChat.id}
              chatId={activeChat.id}
              initialPrompt={initialFor(activeChat.id)}
              onConsumeInitial={consumeInitial}
            />
          )}
        </div>
      </div>

      <PWAInstallPrompt />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
