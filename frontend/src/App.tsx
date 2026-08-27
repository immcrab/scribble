import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ModeSelector } from "./components/ModeSelector";
import { Composer } from "./components/Composer";
import { EmptyState } from "./components/EmptyState";
import { SettingsModal } from "./components/SettingsModal";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { LocationConsentPrompt } from "./components/LocationConsentPrompt";
import { ConsentGate } from "./components/ConsentGate";
import { SharedChatView } from "./components/SharedChatView";
import { NotFoundPage } from "./components/NotFoundPage";
import { hasAcceptedTerms } from "./lib/storage";
import { applyTheme, watchSystemTheme } from "./lib/theme";
import { applyAppearance } from "./lib/appearance";
import {
  parseChatIdFromLocation,
  syncUrlToChat,
  onPopState,
  parseDocsSlugFromLocation,
  isRootLocation,
  isKnownAppLocation,
} from "./lib/router";
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
  // Bare "/" (no chat id, no docs slug) always lands on a blank compose screen — never
  // whichever chat happened to be active last. createChat() reuses an already-empty
  // chat if one exists (same dedup as the sidebar's "New chat" button) rather than
  // making a new one every visit. While this flag is set, the URL stays "/" instead
  // of getting that chat's "/c/{id}" — it only does once the chat has a first message.
  // Cleared either by picking a different chat, or by that first message landing.
  const [freshCompose, setFreshCompose] = useState(() => isRootLocation());
  // Any path that isn't "/", "/c/{id}", or "/docs[/slug]" is a real 404 — it must not
  // silently fall back to the last active chat (see lib/router.ts isKnownAppLocation).
  const [notFound, setNotFound] = useState(() => !isKnownAppLocation());
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

  // Tracks the previous activeChatId so the "did the user navigate to a different chat"
  // effect further down can tell a real change from a no-op re-run (relevant once React's
  // StrictMode dev-mode double-invokes effects — a plain "have we mounted" bool would see
  // a false "change" on the replayed run).
  const prevActiveChatIdRef = useRef(activeChatId);
  // Set right before this component's own code (re)points activeChatId at a blank chat —
  // on mount, popping back to "/", or leaving the 404 page — so that same effect can tell
  // "we just entered fresh-compose" apart from "the user picked a different chat", which
  // otherwise look identical (both are just an activeChatId change).
  const suppressFreshComposeClearRef = useRef(false);

  // Point activeChatId at a blank chat for the fresh "/" compose screen, before the
  // browser paints. A plain useEffect would paint whatever chat was active last for
  // one frame first; doing this in a useState initializer would mutate the store (which
  // Sidebar also reads) while App is still rendering, which React (rightly) warns about.
  // Layout effects run after commit but before paint, so this is the safe, flicker-free spot.
  useLayoutEffect(() => {
    if (isRootLocation()) {
      suppressFreshComposeClearRef.current = true;
      useChatStore.getState().createChat("direct");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
    watchSystemTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.dataset.textSize = settings.textSize;
    document.documentElement.dataset.density = settings.density;
  }, [settings.textSize, settings.density]);

  useEffect(() => {
    applyAppearance(settings);
  }, [settings.fontFamily, settings.boldText, settings.themePalette]);

  // Keep the tab title in sync with whatever's actually on screen — the active
  // chat, a shared chat someone sent us, or the docs section — instead of the
  // static default from index.html.
  useEffect(() => {
    if (docsSlug !== null) return; // DocsPage owns its own title while mounted
    if (notFound) {
      document.title = "Page not found — Scribble";
    } else if (shareState.status === "shared") {
      document.title = `${shareState.chat.title || "Shared chat"} — Scribble`;
    } else if (!freshCompose && activeChat?.title) {
      document.title = `${activeChat.title} — Scribble`;
    } else {
      document.title = "Scribble — Multi-Model AI Chat";
    }
  }, [docsSlug, notFound, shareState, activeChat?.title, freshCompose]);

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
          if (isRootLocation()) {
            // Landing back on "/" (e.g. the back button) — same bootstrap as a fresh
            // "/" mount: point at a blank chat and suppress the effect below's usual
            // "activeChatId changed, drop out of fresh-compose" reaction, since this
            // change *is* the fresh-compose state, not an exit from it.
            suppressFreshComposeClearRef.current = true;
            useChatStore.getState().createChat("direct");
            setFreshCompose(true);
          }
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

  // Re-derive 404 state on back/forward too, so navigating to an unknown path always
  // shows the 404 page (the "/" case is handled by the onPopState handler above, since
  // it also needs to point activeChatId at a blank chat, not just flip a flag).
  useEffect(() => {
    const listener = () => setNotFound(!isKnownAppLocation());
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);

  // Keep the address bar pointed at whichever chat is active — this is what gives every
  // chat its own "/c/{id}" URL. Suspended while viewing someone else's shared chat, docs,
  // the fresh "/" compose screen (that only gets a URL once a message is sent), or the
  // 404 page (the URL there must stay exactly what the visitor typed/followed, not get
  // silently swapped for whatever chat happens to still be active underneath).
  useEffect(() => {
    if (shareState.status !== "idle" || !activeChatId || docsSlug !== null || freshCompose || notFound) return;
    syncUrlToChat(activeChatId);
  }, [activeChatId, shareState.status, docsSlug, freshCompose, notFound]);

  // Picking a chat from the sidebar (or starting a new one) while viewing a shared/unresolved
  // chat should always drop back into the normal app — those actions only ever fire from
  // inside the real app UI, not from the read-only shared view itself.
  useEffect(() => {
    const changed = prevActiveChatIdRef.current !== activeChatId;
    prevActiveChatIdRef.current = activeChatId;
    if (!changed) return;
    setShareState((s) => (s.status === "idle" ? s : { status: "idle" }));
    if (suppressFreshComposeClearRef.current) {
      suppressFreshComposeClearRef.current = false;
    } else {
      setFreshCompose(false);
    }
  }, [activeChatId]);

  // The "/" compose screen only gets a URL once its chat has a first message — see the
  // syncUrlToChat effect below.
  useEffect(() => {
    if (freshCompose && (activeChat?.messages.length ?? 0) > 0) setFreshCompose(false);
  }, [freshCompose, activeChat?.messages.length]);

  // Safety net for a dangling activeChatId (e.g. the active chat vanished via cloud sync).
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
    setFreshCompose(false);
    useChatStore.getState().createChat("direct");
  };

  const startChat = (prompt: string, attachments: Attachment[], codeMode?: boolean) => {
    setFreshCompose(false);
    const id = useChatStore.getState().createChat("direct");
    setPending({ chatId: id, prompt, attachments, codeMode });
  };

  const goHome = () => {
    window.history.pushState(null, "", import.meta.env.BASE_URL);
    suppressFreshComposeClearRef.current = true;
    useChatStore.getState().createChat("direct");
    setNotFound(false);
    setFreshCompose(true);
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

  if (notFound) {
    return <NotFoundPage onHome={goHome} />;
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
      <LocationConsentPrompt />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
