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

/** An upstream failure worth riding out rather than surfacing: rate limits, per-minute or
 * per-day usage/quota caps, transient overload, network blips, and empty responses. Matched
 * against the WorkerClientError text, which carries the provider's own wording (e.g.
 * `xKiro error 429: ...`, xKiro's `A server error occurred. Please try again.`, Puter's
 * usage-limit text). Deliberately broad — anything that isn't permanently broken
 * (see NON_RETRYABLE_RE) is treated as retryable. */
const RATE_LIMIT_RE =
  /(429|500|502|503|504|529)|rate[\s-]?limit|too many requests|quota|usage[\s-]?limit|limit (reached|exceeded)|exceeded your|out of (credit|token)|exhaust|capacity|overload|congest|throttl|temporarily unavailable|server error|internal error|timed?[\s-]?out|timeout|network|failed to fetch|load failed|connection|socket hang|stream error|empty response|try again|busy|unavailable/i;

/** Failures no amount of retrying can fix — a bad key, an unknown model, a sign-in
 * requirement, or Scribble's own daily credit gate. Checked first so those surface
 * immediately instead of spinning in the retry loop. */
const NON_RETRYABLE_RE =
  /(400|401|403|404)|invalid[\s_-]?api[\s_-]?key|api key|unauthori[sz]|authenticat|not found|no such model|unknown model|invalid model|unsupported|daily credit limit|sign in to use|limited to the free default/i;

/** How many times auto-retry re-fires one turn before giving up. Deliberately enormous:
 * the point of the setting is that a rate-limited or overloaded model waits the limit out
 * instead of dropping the turn on the user. Backoff caps at 60s and the Stop button aborts
 * at any point, so in practice this means "keep trying until it works or the user stops it". */
const MAX_RETRY_ROUNDS = 500;

/** Ceiling on the backoff between retries. */
const RETRY_BACKOFF_CAP_MS = 60_000;

/** Backoff before retry attempt N (0-based): a parsed Retry-After wins (capped at 60s),
 * otherwise 2s, 4s, 8s, 16s, 32s, then 60s from there on — each with +/-20% jitter so
 * parallel panes (Battle, Side by Side, a project broadcast) don't all re-fire in lockstep
 * and re-trigger the same limit. */
function retryBackoffMs(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec && retryAfterSec > 0) return Math.min(retryAfterSec * 1000, RETRY_BACKOFF_CAP_MS);
  const base = Math.min(2000 * 2 ** attempt, RETRY_BACKOFF_CAP_MS);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

/** Pull a Retry-After hint out of an upstream error string, if the provider included one. */
function parseRetryAfter(msg: string): number | undefined {
  const m = msg.match(/retry[\s_-]?after["':\s]+(\d+)/i);
  return m ? Number(m[1]) : undefined;
}

/** Should this failure be waited out and re-fired? */
function isRetryable(message: string): boolean {
  if (NON_RETRYABLE_RE.test(message)) return false;
  return RATE_LIMIT_RE.test(message);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Nudge sent as a fresh user turn to resume a reply cut off at the output-token limit.
 * Shared by the manual "Continue" button (in the mode components) and the auto-continue
 * loop below. */
export const CONTINUE_NUDGE =
  "Your previous message was cut off because it reached the length limit. Continue it from exactly where it stopped — resume mid-line if needed, do not repeat any text you already sent, and do not add any preamble.";

/** Hard cap on how many times auto-continue will re-fire for one reply. High enough that a
 * long answer (or a model with a small output ceiling) finishes on its own instead of
 * stopping mid-file; the real brake is MAX_STALLED_CONTINUE_ROUNDS below, which stops a
 * model that keeps re-firing without producing anything new. The manual Continue button
 * remains available once this is exhausted. */
const MAX_AUTO_CONTINUE_ROUNDS = 40;

/** Consecutive auto-continue rounds that add no new text before we stop. Without this, a
 * model that answers every continue nudge with an empty reply would burn all 40 rounds. */
const MAX_STALLED_CONTINUE_ROUNDS = 2;

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
  /** Internal: consecutive auto-continue rounds that produced no new text. */
  stalledContinueRounds?: number;
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

  const currentContent = () =>
    useChatStore.getState().chats.find((c) => c.id === chatId)?.messages.find((m) => m.id === messageId)?.content ?? "";

  /** Text already on screen when this invocation started — used to tell a productive
   * auto-continue round from one that added nothing. */
  const contentAtStart = appendToExisting ? currentContent().length : 0;

  /** Hold for `ms`, showing a live countdown in the message's retry notice. Resolves early
   * (returning false) if the user hits Stop. */
  const countdown = async (ms: number, label: (secondsLeft: number) => string): Promise<boolean> => {
    const until = Date.now() + ms;
    while (Date.now() < until && !controller.signal.aborted) {
      const left = Math.ceil((until - Date.now()) / 1000);
      useChatStore.getState().updateMessage(chatId, messageId, { retryNotice: label(left) });
      await sleep(Math.min(until - Date.now(), 1000));
    }
    if (controller.signal.aborted) {
      useChatStore.getState().updateMessage(chatId, messageId, { streaming: false, retryNotice: undefined });
      return false;
    }
    clearNotice();
    return true;
  };

  /** Re-fire this turn as a continuation: the partial reply so far is replayed as the
   * assistant's turn, followed by the continue nudge, and incoming tokens append in place.
   * Used both when the model hits its output-token ceiling and when a retryable failure
   * kills the stream after tokens have already landed (restarting from scratch there would
   * throw away everything the user can already see). */
  const continueInPlace = async (round: number, stalled: number) => {
    useChatStore.getState().updateMessage(chatId, messageId, { streaming: true, truncated: false });
    await runAssistantStream({
      ...params,
      history: [
        ...history,
        { role: "assistant" as const, content: currentContent() },
        { role: "user" as const, content: CONTINUE_NUDGE },
      ],
      appendToExisting: true,
      autoContinueRound: round + 1,
      stalledContinueRounds: stalled,
    });
  };

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

        // Some providers (notably Claude models proxied through xKiro) drop the stream
        // mid-answer without ever sending a `length` finish_reason, so `truncated` stays
        // false and the reply just stops — often inside a code block. If the text ends on
        // an unterminated ``` fence, treat it as cut off so auto-continue can resume it and
        // the workspace parses the half-written file instead of discarding it.
        if (!truncated) {
          const soFar = useChatStore.getState().chats.find((c) => c.id === chatId)?.messages.find((m) => m.id === messageId)?.content ?? "";
          if ((soFar.match(/```/g)?.length ?? 0) % 2 === 1) truncated = true;
        }

        useChatStore.getState().updateMessage(chatId, messageId, { streaming: false, truncated, retryNotice: undefined });
        recordModelUsage(model);
        // Credit accounting: prompt tokens (everything we sent) + this reply's tokens.
        const finalMsg = useChatStore.getState().chats.find((c) => c.id === chatId)?.messages.find((m) => m.id === messageId);
        const promptTokens = history.reduce((n, m) => n + estimateTokenCount(m.content ?? ""), 0);
        const replyTokens = estimateTokenCount(finalMsg?.content ?? "") + estimateTokenCount(finalMsg?.reasoning ?? "");
        recordCreditUsage(model, promptTokens + replyTokens);

        // Auto-continue: reply hit the output-token limit — resume it in place, same shape as
        // the manual Continue button, until the model stops, stalls, or the round cap is hit.
        const round = params.autoContinueRound ?? 0;
        const madeProgress = !appendToExisting || (finalMsg?.content?.length ?? 0) > contentAtStart;
        const stalled = madeProgress ? 0 : (params.stalledContinueRounds ?? 0) + 1;
        const canAutoContinue =
          truncated &&
          round < MAX_AUTO_CONTINUE_ROUNDS &&
          stalled < MAX_STALLED_CONTINUE_ROUNDS &&
          !!finalMsg?.content;
        if (canAutoContinue) {
          await continueInPlace(round, stalled);
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
        const retryable = store.settings.autoRetryRateLimited && attempt < maxAttempts - 1 && isRetryable(message);
        if (!retryable) {
          useChatStore.getState().updateMessage(chatId, messageId, { streaming: false, error: message, retryNotice: undefined });
          return;
        }

        const backoff = retryBackoffMs(attempt, parseRetryAfter(message));

        // The stream died after tokens had already landed (a limit hit mid-reply, a dropped
        // connection). Re-firing the whole turn would discard what the user can already see,
        // so wait it out and resume in place instead — same path as auto-continue.
        const round = params.autoContinueRound ?? 0;
        if (sawOutput && currentContent() && round < MAX_AUTO_CONTINUE_ROUNDS) {
          if (!(await countdown(backoff, (left) => `Interrupted — resuming in ${left}s…`))) return;
          await continueInPlace(round, params.stalledContinueRounds ?? 0);
          return;
        }

        // Nothing streamed yet — back off with a live countdown, then loop round to re-fire.
        if (!(await countdown(backoff, (left) => `Rate limited — retrying in ${left}s… (attempt ${attempt + 2})`))) return;
      }
    }
  } finally {
    useChatStore.getState().abortControllers.delete(messageId);
  }
}
