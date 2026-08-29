import { streamChat, type WireMessage } from "../providers";
import type { Effort, ModelDef } from "../types";
import { useChatStore } from "../state/chatStore";
import { isModelGated } from "../config/models";
import { auth } from "./firebase";
import { recordModelUsage } from "./modelStats";
import { recordCreditUsage, usageGate } from "./usage";
import { estimateTokenCount } from "./tokenCount";
import { getClientContext } from "./clientContext";
import { playNotificationSound } from "./notificationSound";

/** Nudge sent as a fresh user turn to resume a reply cut off at the output-token limit.
 * Shared by the manual "Continue" button (in the mode components) and the auto-continue
 * loop below. */
export const CONTINUE_NUDGE =
  "Your previous message was cut off because it reached the length limit. Continue it from exactly where it stopped — resume mid-line if needed, do not repeat any text you already sent, and do not add any preamble.";

/** Hard cap on how many times auto-continue will re-fire for one reply, so a model that
 * keeps hitting the limit (or never stops) can't loop forever. The manual Continue button
 * remains available once this is exhausted. */
const MAX_AUTO_CONTINUE_ROUNDS = 5;

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
  webSearch?: boolean;
  /** Resuming a truncated reply: keep the message's existing content/reasoning and
   * append incoming tokens to it, rather than treating the message as brand-new. */
  appendToExisting?: boolean;
  /** Internal: how many times auto-continue has already re-fired for this reply. */
  autoContinueRound?: number;
}) {
  const { chatId, messageId, model, history, effort, webSearch, appendToExisting } = params;
  const store = useChatStore.getState();

  if (isModelGated(model) && !auth.currentUser) {
    store.updateMessage(chatId, messageId, {
      streaming: false,
      error: `Sign in to use ${model.displayName} — the free default (Mistral Small 4) doesn't need an account.`,
    });
    return;
  }

  const gate = usageGate(model);
  if (!gate.ok) {
    store.updateMessage(chatId, messageId, { streaming: false, error: gate.reason });
    return;
  }

  const controller = new AbortController();
  store.registerAbort(messageId, controller);

  const customProvider =
    model.provider === "custom"
      ? store.settings.customProviders.find((p) => p.id === model.customProviderId)
      : undefined;

  const thinkingStartedAt = Date.now();
  // On a continue, the message already has content and a frozen thinking time — don't
  // reset the timer or re-stamp it when the first token lands.
  if (!appendToExisting) store.updateMessage(chatId, messageId, { thinkingStartedAt });
  let thinkingStamped = appendToExisting ?? false;
  let truncated = false;

  const lastUserMessage = [...history].reverse().find((m) => m.role === "user")?.content;
  const clientContext = await getClientContext(
    store.settings.locationConsent,
    lastUserMessage,
    store.settings.customSystemPrompt,
    store.settings.memoryEnabled ? store.memories.map((m) => m.content) : undefined,
    store.settings.replyLanguage
  );

  try {
    for await (const chunk of streamChat({
      workerUrl: store.settings.workerUrl,
      password: store.settings.password,
      model,
      messages: history,
      signal: controller.signal,
      customProvider: customProvider ? { baseUrl: customProvider.baseUrl, apiKey: customProvider.apiKey } : undefined,
      effort,
      webSearch,
      memoryEnabled: store.settings.memoryEnabled,
      clientContext,
    })) {
      if (chunk.type === "reasoning") {
        useChatStore.getState().appendMessageReasoning(chatId, messageId, chunk.text);
        continue;
      }
      if (chunk.type === "truncated") {
        truncated = true;
        continue;
      }
      if (chunk.type === "toolCall") {
        const current = useChatStore.getState().chats.find((c) => c.id === chatId)?.messages.find((m) => m.id === messageId);
        const existing = current?.toolCalls ?? [];
        const next = existing.some((t) => t.id === chunk.toolCall.id)
          ? existing.map((t) => (t.id === chunk.toolCall.id ? chunk.toolCall : t))
          : [...existing, chunk.toolCall];
        useChatStore.getState().updateMessage(chatId, messageId, { toolCalls: next });
        if (chunk.toolCall.name === "Memory" && chunk.toolCall.status === "done" && chunk.toolCall.output) {
          useChatStore.getState().addMemory(chunk.toolCall.output);
        }
        continue;
      }
      if (!thinkingStamped) {
        thinkingStamped = true;
        useChatStore.getState().updateMessage(chatId, messageId, { thinkingMs: Date.now() - thinkingStartedAt });
      }
      useChatStore.getState().appendMessageContent(chatId, messageId, chunk.text);
    }
    useChatStore.getState().updateMessage(chatId, messageId, { streaming: false, truncated });
    recordModelUsage(model);
    // Credit accounting: prompt tokens (everything we sent) + this reply's tokens.
    const finalMsg = useChatStore.getState().chats.find((c) => c.id === chatId)?.messages.find((m) => m.id === messageId);
    const promptTokens = history.reduce((n, m) => n + estimateTokenCount(m.content ?? ""), 0);
    const replyTokens = estimateTokenCount(finalMsg?.content ?? "") + estimateTokenCount(finalMsg?.reasoning ?? "");
    recordCreditUsage(model, promptTokens + replyTokens);

    // Auto-continue: reply hit the output-token limit — resume it in place, same shape as
    // the manual Continue button, until the model stops or the round cap is reached.
    const round = params.autoContinueRound ?? 0;
    const canAutoContinue =
      truncated &&
      useChatStore.getState().settings.autoContinueTruncated &&
      round < MAX_AUTO_CONTINUE_ROUNDS &&
      !!finalMsg?.content;
    if (canAutoContinue) {
      const continuation = [
        ...history,
        { role: "assistant" as const, content: finalMsg!.content },
        { role: "user" as const, content: CONTINUE_NUDGE },
      ];
      useChatStore.getState().updateMessage(chatId, messageId, { streaming: true, truncated: false });
      await runAssistantStream({
        ...params,
        history: continuation,
        appendToExisting: true,
        autoContinueRound: round + 1,
      });
      return;
    }

    if (store.settings.notificationSound) playNotificationSound();
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
