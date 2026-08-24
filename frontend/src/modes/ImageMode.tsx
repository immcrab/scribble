import { useEffect, useState } from "react";
import { Image as ImageIcon, Send, Loader2 } from "lucide-react";
import { useChatStore } from "../state/chatStore";
import { ChatMessage } from "../components/ChatMessage";
import { generateImage } from "../lib/imageClient";
import { auth } from "../lib/firebase";
import { useAutoScroll } from "../lib/useAutoScroll";
import { uid } from "../lib/id";
import type { ChatMessage as ChatMessageType } from "../types";
import type { InitialPrompt } from "../App";

const SUGGESTIONS = [
  "A watercolor fox reading a book in a forest clearing",
  "Retro synthwave skyline at sunset, neon grid horizon",
  "A cozy cabin in the mountains, soft morning light",
];

export function ImageMode({
  chatId,
  initialPrompt,
  onConsumeInitial,
}: {
  chatId: string;
  initialPrompt?: InitialPrompt;
  onConsumeInitial?: () => void;
}) {
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const settings = useChatStore((s) => s.settings);
  const { addMessage, updateMessage, maybeAutoTitle } = useChatStore();
  const [prompt, setPrompt] = useState("");
  const chatEndRef = useAutoScroll<HTMLDivElement>(chat?.messages ?? []);

  if (!chat) return null;

  const generating = chat.messages.some((m) => m.streaming);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || generating) return;
    setPrompt("");

    const userMsg: ChatMessageType = { id: uid(), role: "user", content: trimmed, createdAt: Date.now() };
    addMessage(chat.id, userMsg);
    maybeAutoTitle(chat.id, trimmed);

    const assistantMsg: ChatMessageType = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      streaming: true,
      thinkingStartedAt: Date.now(),
    };
    addMessage(chat.id, assistantMsg);

    if (!auth.currentUser) {
      updateMessage(chat.id, assistantMsg.id, {
        streaming: false,
        error: "Sign in to generate images.",
      });
      return;
    }

    try {
      const dataUrl = await generateImage({ workerUrl: settings.workerUrl, password: settings.password, prompt: trimmed });
      updateMessage(chat.id, assistantMsg.id, {
        streaming: false,
        attachments: [{ id: uid(), name: "generated.png", type: "image/png", dataUrl, size: dataUrl.length }],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Image generation failed.";
      updateMessage(chat.id, assistantMsg.id, { streaming: false, error: message });
    }
  };

  useEffect(() => {
    if (initialPrompt && chat.messages.length === 0) {
      send(initialPrompt.prompt);
      onConsumeInitial?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-base-700/60 px-5 py-3">
        <ImageIcon size={15} className="text-accent-400" />
        <span className="text-sm font-medium text-slate-200">Image generation</span>
      </div>

      {chat.messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
          <h1 className="font-serif text-3xl font-light tracking-tighter text-slate-100 sm:text-4xl">
            What should we create?
          </h1>
          <div className="flex flex-col gap-2 sm:flex-row">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="max-w-xs rounded-xl border border-base-700/60 bg-base-850/50 p-3 text-left text-xs text-slate-400 transition-all hover:-translate-y-0.5 hover:border-accent-500/50 hover:text-slate-200"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8" ref={chatEndRef}>
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {chat.messages.map((m) => (
              <ChatMessage key={m.id} message={m} />
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-8">
        <div className="flex items-center gap-2 rounded-2xl border border-base-600/60 bg-base-850/70 p-2 shadow-panel">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(prompt);
              }
            }}
            placeholder="Describe the image you want..."
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-white outline-none placeholder-slate-500"
          />
          <button
            onClick={() => send(prompt)}
            disabled={!prompt.trim() || generating}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-base-950 transition-colors hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40"
            title="Generate"
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
