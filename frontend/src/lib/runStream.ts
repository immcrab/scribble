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
import { acquireRequestSlot } from "./requestQueue";

/** An upstream error message that looks like a rate limit / transient overload — the
 * class of failure that auto-retry-with-backoff is meant to ride out. Matched against
 * the WorkerClientError text, which carries the provider's own wording (e.g.
 * `xKiro error 429: ...`, xKiro's `A server error occurred. Please try again.`). */
const RATE_LIMIT_RE = /\b429\b|rate[\s-]?limit|too many requests|quota|server error occurred|overloaded|temporarily unavailable/i;

/** How many times auto-retry re-fires one turn before giving up and surfacing the error. */
const MAX_RETRY_ROUNDS = 4;

/** Backoff before retry attempt N (0-based): a parsed Retry-After wins (capped at 60s),
 * otherwise 2s, 4s, 8s, 16s. */
function retryBackoffMs(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec && retryAfterSec > 0) return Math.min(retryAfterSec, 60) * 1000;
  return Math.min(2000 * 2 ** attempt, 16000);
}

/** Pull a Retry-After hint out of an upstream error string, if the provider included one. */
function parseRetryAfter(msg: string): number | undefined {
  const m = msg.match(/retry[\s_-]?after["':\s]+(\d+)/i);
  return m ? Number(m[1]) : undefined;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

  const clearNotice = () => useChatStore.getState().updateMessage(chatId, messageId, { retryNotice: undefined });

  try {
    // Request pacing: hold this turn until the global queue grants a slot, so a burst
    // (Battle/Side-by-Side panes, an Agent tool loop, the project broadcast bar,
    // auto-continue) stays under the provider's per-minute cap. No-op at spacing 0.
    await acquireRequestSlot(controller.signal, (secondsLeft) => {
      useChatStore.getState().updateMessage(chatId, messageId, {
        retryNotice: secondsLeft > 0 ? `Pacing requests — starting in ${secondsLeft}s…` : undefined,
      });
    });
    if (controller.signal.aborted) {
      useChatStore.getState().updateMessage(chatId, messageId, { streaming: false, retryNotice: undefined });
      return;
    }

    // Attempt loop: on a rate-limit-shaped failure with no tokens yet, back off and
    // re-fire the whole request rather than surfacing the error (settings.autoRetryRateLimited).
    const maxAttempts = store.settings.autoRetryRateLimited ? MAX_RETRY_ROUNDS + 1 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let sawOutput = false;
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
            sawOutput = true;
            useChatStore.getState().appendMessageReasoning(chatId, messageId, chunk.text);
            continue;
          }
          if (chunk.type === "truncated") {
            truncated = true;
            continue;
          }
          if (chunk.type === "toolCall") {
            sawOutput = true;
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
          sawOutput = true;
          if (attempt > 0) clearNotice();
          useChatStore.getState().appendMessageContent(chatId, messageId, chunk.text);
        }

        useChatStore.getState().updateMessage(chatId, messageId, { streaming: false, truncated, retryNotice: undefined });
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
        return;
      } catch (err) {
        if (controller.signal.aborted) {
          useChatStore.getState().updateMessage(chatId, messageId, { streaming: false, retryNotice: undefined });
          return;
        }
        const message = err instanceof Error ? err.message : "Something went wrong.";
        const canRetry = attempt < maxAttempts - 1 && !sawOutput && RATE_LIMIT_RE.test(message);
        if (!canRetry) {
          useChatStore.getState().updateMessage(chatId, messageId, { streaming: false, error: message, retryNotice: undefined });
          return;
        }
        // Back off with a live countdown, then loop round to re-fire.
        const until = Date.now() + retryBackoffMs(attempt, parseRetryAfter(message));
        while (Date.now() < until && !controller.signal.aborted) {
          const left = Math.ceil((until - Date.now()) / 1000);
          useChatStore.getState().updateMessage(chatId, messageId, { retryNotice: `Rate limited — retrying in ${left}s…` });
          await sleep(Math.min(until - Date.now(), 1000));
        }
        if (controller.signal.aborted) {
          useChatStore.getState().updateMessage(chatId, messageId, { streaming: false, retryNotice: undefined });
          return;
        }
        clearNotice();
      }
    }
  } finally {
    useChatStore.getState().abortControllers.delete(messageId);
  }
}
