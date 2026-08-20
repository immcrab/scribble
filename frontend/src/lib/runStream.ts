import { streamChat, type WireMessage } from "../providers";
import type { ModelDef } from "../types";
import { useChatStore } from "../state/chatStore";

/**
 * Drives a single assistant message's streaming lifecycle: fetches tokens
 * from the Worker and writes them into the chat store as they arrive. Shared
 * by every mode (Direct, Battle, Side by Side, Agent) so streaming, abort,
 * and error handling behave identically everywhere.
 */
export async function runAssistantStream(params: {
  chatId: string;
  messageId: string;
  model: ModelDef;
  history: WireMessage[];
}) {
  const { chatId, messageId, model, history } = params;
  const store = useChatStore.getState();
  const controller = new AbortController();
  store.registerAbort(messageId, controller);

  const customProvider =
    model.provider === "custom"
      ? store.settings.customProviders.find((p) => p.id === model.customProviderId)
      : undefined;

  try {
    for await (const delta of streamChat({
      workerUrl: store.settings.workerUrl,
      password: store.settings.password,
      model,
      messages: history,
      signal: controller.signal,
      customProvider: customProvider ? { baseUrl: customProvider.baseUrl, apiKey: customProvider.apiKey } : undefined,
    })) {
      useChatStore.getState().appendMessageContent(chatId, messageId, delta);
    }
    useChatStore.getState().updateMessage(chatId, messageId, { streaming: false });
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
