import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ModeSelector } from "./components/ModeSelector";
import { Composer } from "./components/Composer";
import { EmptyState } from "./components/EmptyState";
import { SettingsModal } from "./components/SettingsModal";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { ConsentGate } from "./components/ConsentGate";
import { SharedChatView } from "./components/SharedChatView";
import { hasAcceptedTerms } from "./lib/storage";
import { applyTheme, watchSystemTheme } from "./lib/theme";
import { parseChatIdFromLocation, syncUrlToChat, onPopState, parseDocsSlugFromLocation } from "./lib/router";
import { DocsPage } from "./pages/DocsPage";
import { fetchPublicChat } from "./lib/cloudSync";
import { DirectMode } from "./modes/DirectMode";
import { BattleMode } from "./modes/BattleMode";
import { SideBySideMode } from "./modes/SideBySideMode";
import { AgentMode } from "./modes/AgentMode";
import { ImageMode } from "./modes/ImageMode";
import { useChatStore } from "./state/chatStore";
import type { Attachment, Chat, Mode } from "./types";

type ShareState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "shared"; chat: Chat }
  | { status: "not-found" };

/** Resolves a "/c/{id}" URL that doesn't match a local chat: fetches it from the
 * public share store (see cloudSync.ts). Shared between the initial-mount check
 * and the popstate handler below. */
function resolveShare(id: string, setShareState: (s: ShareState) => void) {
  setShareState({ status: "resolving" });
  void fetchPublicChat(id).then((chat) => {
    setShareState(chat ? { status: "shared", chat } : { status: "not-found" });
  });
}

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
  const [docsSlug, setDocsSlug] = useState<string | null>(() => parseDocsSlugFromLocation());
  const [accepted, setAccepted] = useState(hasAcceptedTerms);
  const [shareState, setShareState] = useState<ShareState>(() => {
    const urlId = parseChatIdFromLocation();
    if (!urlId) return { status: "idle" };
    const local = useChatStore.getState().chats.find((c) => c.id === urlId);
    if (local) {
      useChatStore.getState().setActiveChat(urlId);
      return { status: "idle" };
    }
    return { status: "resolving" };
  });

  useEffect(() => {
    applyTheme(settings.theme);
    watchSystemTheme(settings.theme);
  }, [settings.theme]);

  // Kick off the fetch for a shared chat this browser doesn't have locally
  // (deferred out of useState's initializer, which must stay side-effect-free).
  useEffect(() => {
    if (shareState.status !== "resolving") return;
    const urlId = parseChatIdFromLocation();
    if (!urlId) return;
    resolveShare(urlId, setShareState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back/forward navigation: re-resolve whichever chat (local or shared) the URL now points at.
  useEffect(
    () =>
      onPopState((urlId) => {
        if (!urlId) {
          setShareState({ status: "idle" });
          return;
        }
        const local = useChatStore.getState().chats.find((c) => c.id === urlId);
        if (local) {
          setShareState({ status: "idle" });
          useChatStore.getState().setActiveChat(urlId);
          return;
        }
        resolveShare(urlId, setShareState);
      }),
    []
  );

  // Docs is a separate section entirely (see pages/DocsPage.tsx) — track its own slug
  // ("" = index, null = not in docs) so back/forward through /docs/{model} pages works.
  useEffect(() => {
    const listener = () => setDocsSlug(parseDocsSlugFromLocation());
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);

  // Keep the address bar pointed at whichever chat is active — this is what gives every
  // chat its own "/c/{id}" URL. Suspended while viewing someone else's shared chat, or docs.
  useEffect(() => {
    if (shareState.status !== "idle" || !activeChatId || docsSlug !== null) return;
    syncUrlToChat(activeChatId);
  }, [activeChatId, shareState.status, docsSlug]);

  // Picking a chat from the sidebar (or starting a new one) while viewing a shared/unresolved
  // chat should always drop back into the normal app — those actions only ever fire from
  // inside the real app UI, not from the read-only shared view itself. Skip the mount run:
  // every effect fires once on mount regardless of its deps, and at that point activeChatId
  // "changing" is just the initial value showing up, not a real navigation.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setShareState((s) => (s.status === "idle" ? s : { status: "idle" }));
  }, [activeChatId]);

  useEffect(() => {
    if (shareState.status !== "idle") return;
    if (!activeChat) {
      if (chats.length > 0) {
        useChatStore.getState().setActiveChat(chats[0].id);
      } else {
        useChatStore.getState().createChat("direct");
      }
    }
  }, [activeChat, chats, shareState.status]);

  const startOwnChat = () => {
    setShareState({ status: "idle" });
    useChatStore.getState().createChat("direct");
  };

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

  if (docsSlug !== null) {
    return (
      <DocsPage
        slug={docsSlug}
        onExit={() => {
          window.history.pushState(null, "", import.meta.env.BASE_URL);
          setDocsSlug(null);
        }}
      />
    );
  }

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
          {shareState.status === "resolving" && (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading shared chat…</div>
          )}
          {shareState.status === "not-found" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-slate-400">This shared chat doesn't exist, or the link is wrong.</p>
              <button
                onClick={startOwnChat}
                className="rounded-lg border border-base-600/60 bg-base-800/60 px-4 py-2 text-sm font-medium text-slate-200 hover:border-accent-500/50 hover:bg-base-700/60 hover:text-white"
              >
                Start a new chat
              </button>
            </div>
          )}
          {shareState.status === "shared" && <SharedChatView chat={shareState.chat} onStartOwn={startOwnChat} />}
          {shareState.status === "idle" && !activeChat && (
            <div className="flex h-full flex-col">
              <div className="flex-1">
                <EmptyState onPick={(p) => startChat(p, [])} />
              </div>
              <div className="mx-auto w-full max-w-3xl px-4 pb-8 sm:px-8">
                <Composer onSend={startChat} generating={false} autoFocus sendOnEnter={settings.sendOnEnter} />
              </div>
            </div>
          )}
          {shareState.status === "idle" && activeChat?.mode === "direct" && (
            <DirectMode
              key={activeChat.id}
              chatId={activeChat.id}
              initialPrompt={initialFor(activeChat.id)}
              onConsumeInitial={consumeInitial}
            />
          )}
          {shareState.status === "idle" && activeChat?.mode === "battle" && (
            <BattleMode
              key={activeChat.id}
              chatId={activeChat.id}
              initialPrompt={initialFor(activeChat.id)}
              onConsumeInitial={consumeInitial}
            />
          )}
          {shareState.status === "idle" && activeChat?.mode === "side-by-side" && (
            <SideBySideMode
              key={activeChat.id}
              chatId={activeChat.id}
              initialPrompt={initialFor(activeChat.id)}
              onConsumeInitial={consumeInitial}
            />
          )}
          {shareState.status === "idle" && activeChat?.mode === "agent" && (
            <AgentMode
              key={activeChat.id}
              chatId={activeChat.id}
              initialPrompt={initialFor(activeChat.id)}
              onConsumeInitial={consumeInitial}
            />
          )}
          {shareState.status === "idle" && activeChat?.mode === "image" && (
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
