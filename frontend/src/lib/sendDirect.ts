import { useChatStore } from "../state/chatStore";
import { findModel, getDefaultModel } from "../config/models";
import { runAssistantStream } from "./runStream";
import { uid } from "./id";
import type { Attachment, ChatMessage } from "../types";
import type { WireMessage } from "../providers";

/**
 * Fires one user turn into a Direct-mode chat: appends the user message and a
 * streaming assistant placeholder, auto-titles the chat, and kicks off the
 * stream. Pulled out of DirectMode so the project view's broadcast bar can loop
 * this over every chat in a project — see components/ProjectView.tsx.
 *
 * Reads everything it needs from the store by id, so it's safe to call for a
 * chat that isn't the one currently mounted on screen.
 */
export function sendDirectMessage(chatId: string, text: string, attachments: Attachment[] = []): void {
  const store = useChatStore.getState();
  const chat = store.chats.find((c) => c.id === chatId);
  if (!chat) return;

  const model = (chat.modelId ? findModel(chat.modelId) : undefined) ?? getDefaultModel(store.settings.defaultModelId);
  if (!chat.modelId) store.setChatModels(chat.id, { modelId: model.modelId });

  const userMsg: ChatMessage = {
    id: uid(),
    role: "user",
    content: text,
    createdAt: Date.now(),
    attachments,
  };
  store.addMessage(chat.id, userMsg);
  store.maybeAutoTitle(chat.id, text);

  const assistantMsg: ChatMessage = {
    id: uid(),
    role: "assistant",
    content: "",
    createdAt: Date.now(),
    model,
    streaming: true,
  };
  store.addMessage(chat.id, assistantMsg);

  const wireAttachments = attachments.map((a) => ({ name: a.name, type: a.type, dataUrl: a.dataUrl }));
  const history: WireMessage[] = [
    ...chat.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        attachments: m.attachments?.map((a) => ({ name: a.name, type: a.type, dataUrl: a.dataUrl })),
      })),
    { role: "user", content: text, attachments: wireAttachments },
  ];

  runAssistantStream({
    chatId: chat.id,
    messageId: assistantMsg.id,
    model,
    history,
    effort: chat.effort ?? store.settings.effort,
    webSearch: store.settings.autoWebSearch,
  });
}
