import { PenLine, Lock } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import type { Chat } from "../types";

/**
 * Read-only landing for a "/c/{id}" link opened by someone who isn't signed in and
 * doesn't have this chat locally — an anonymous visitor following a shared URL. Shows
 * the conversation as-is; the only action is starting a fresh chat of their own.
 */
export function SharedChatView({ chat, onStartOwn }: { chat: Chat; onStartOwn: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-base-700/60 px-5 py-3">
        <Lock size={14} className="text-slate-500" />
        <span className="text-sm font-medium text-slate-300">Shared chat</span>
        <span className="text-xs text-slate-500">— view only</span>
        <button
          onClick={onStartOwn}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-base-600/60 bg-base-800/60 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-accent-500/50 hover:bg-base-700/60 hover:text-white"
        >
          <PenLine size={13} className="text-accent-400" />
          Start your own chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {chat.messages.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}
        </div>
      </div>
    </div>
  );
}
