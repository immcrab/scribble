import { streamChat, type WireMessage } from "../providers";
import type { Effort, ModelDef } from "../types";
import { useChatStore } from "../state/chatStore";
import { isModelGated } from "../config/models";
import { auth } from "./firebase";
import { recordModelUsage } from "./modelStats";

/**
 * Drives a single assistant message's streaming lifecycle: fetches tokens
 * from the Worker and writes them into the chat store as they arrive. Shared
 * by every mode (Direct, Battle, Side by Side, Agent) so streaming, abort,
 * error handling, the thinking timer, and reasoning-text bookkeeping all
 * behave identically everywhere.
 */
export async function runAssistantStream(params: {
  chatId: string;
  messageId: string;
  model: ModelDef;
  history: WireMessage[];
  effort?: Effort;
}) {
  const { chatId, messageId, model, history, effort } = params;
  const store = useChatStore.getState();

  if (isModelGated(model) && !auth.currentUser) {
    store.updateMessage(chatId, messageId, {
      streaming: false,
      error: `Sign in to use ${model.displayName} — the free default (Mistral Small 4) doesn't need an account.`,
    });
    return;
  }

  const controller = new AbortController();
  store.registerAbort(messageId, controller);

  const customProvider =
    model.provider === "custom"
      ? store.settings.customProviders.find((p) => p.id === model.customProviderId)
      : undefined;

  const thinkingStartedAt = Date.now();
  store.updateMessage(chatId, messageId, { thinkingStartedAt });
  let thinkingStamped = false;

  try {
    for await (const chunk of streamChat({
      workerUrl: store.settings.workerUrl,
      password: store.settings.password,
      model,
      messages: history,
      signal: controller.signal,
      customProvider: customProvider ? { baseUrl: customProvider.baseUrl, apiKey: customProvider.apiKey } : undefined,
      effort,
    })) {
      if (chunk.type === "reasoning") {
        useChatStore.getState().appendMessageReasoning(chatId, messageId, chunk.text);
        continue;
      }
      if (!thinkingStamped) {
        thinkingStamped = true;
        useChatStore.getState().updateMessage(chatId, messageId, { thinkingMs: Date.now() - thinkingStartedAt });
      }
      useChatStore.getState().appendMessageContent(chatId, messageId, chunk.text);
    }
    useChatStore.getState().updateMessage(chatId, messageId, { streaming: false });
    recordModelUsage(model);
  } catch (err) {
    if (controller.signal.aborted) {
      useChatStore.getState().updateMessage(chatId, messageId, { streaming: false });
      return;
    }
    const message = err instanceof Error ? err.message : "Something went wrong.";
    useChatStore.getState().updateMessage(chatId, messageId, { streaming: false, error: message });
  } finally {
    useChatStore.getState().abortControllers.delete(messageId);
  }
}
