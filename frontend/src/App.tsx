import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ModeSelector } from "./components/ModeSelector";
import { Composer } from "./components/Composer";
import { EmptyState } from "./components/EmptyState";
import { SettingsModal } from "./components/SettingsModal";
import { DirectMode } from "./modes/DirectMode";
import { BattleMode } from "./modes/BattleMode";
import { SideBySideMode } from "./modes/SideBySideMode";
import { AgentMode } from "./modes/AgentMode";
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
  const activeChat = chats.find((c) => c.id === activeChatId);

  const [landingMode, setLandingMode] = useState<Mode>("battle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, setPending] = useState<InitialPrompt | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const startChat = (prompt: string, attachments: Attachment[], codeMode?: boolean) => {
    const id = useChatStore.getState().createChat(landingMode);
    setPending({ chatId: id, prompt, attachments, codeMode });
  };

  const switchMode = (mode: Mode) => {
    if (activeChat && mode !== activeChat.mode) {
      useChatStore.getState().createChat(mode);
    } else if (!activeChat) {
      setLandingMode(mode);
    }
  };

  const initialFor = (chatId: string) => (pending?.chatId === chatId ? pending : undefined);
  const consumeInitial = () => setPending(null);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-base-950">
      <Sidebar
        onOpenSettings={() => setSettingsOpen(true)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-base-700/60 hover:text-white md:hidden"
            title="Open menu"
          >
            <Menu size={19} />
          </button>
          <ModeSelector mode={activeChat?.mode ?? landingMode} onChange={switchMode} />
        </div>

        <div className="min-h-0 flex-1">
          {!activeChat && (
            <div className="flex h-full flex-col">
              <div className="flex-1">
                <EmptyState onPick={(p) => startChat(p, [])} />
              </div>
              <div className="mx-auto w-full max-w-3xl px-4 pb-8 sm:px-8">
                <Composer onSend={startChat} generating={false} autoFocus />
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
        </div>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
