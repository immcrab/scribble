import { useEffect, useState } from "react";
import { FileSearch, Terminal, Lightbulb } from "lucide-react";
import { useChatStore } from "../state/chatStore";
import { getDefaultModel, findModel } from "../config/models";
import { ChatMessage } from "../components/ChatMessage";
import { Composer } from "../components/Composer";
import { ModelSelector } from "../components/ModelSelector";
import { EffortSelector } from "../components/EffortSelector";
import { EmptyState } from "../components/EmptyState";
import { ArtifactWorkspace } from "../components/ArtifactWorkspace";
import { ChatWorkspaceSplit } from "../components/ChatWorkspaceSplit";
import { isCodingRequest } from "../lib/codeArtifact";
import { useLiveArtifact, liveArtifactFor } from "../lib/useLiveArtifact";
import { runAssistantStream, CONTINUE_NUDGE } from "../lib/runStream";
import { useAutoScroll } from "../lib/useAutoScroll";
import { uid } from "../lib/id";
import type { Attachment, ChatMessage as ChatMessageType } from "../types";
import type { WireMessage } from "../providers";
import type { InitialPrompt } from "../App";

const PLANNED_TOOLS = [
  { icon: FileSearch, label: "File analysis" },
  { icon: Terminal, label: "Code execution" },
];

/**
 * Agent Mode runs a normal streaming chat turn against the selected model,
 * plus web search: when Settings → General → "Web search" is on (the
 * default), the Worker decides per-turn whether the reply needs a live
 * search and runs one automatically, emitting `toolCall` NDJSON events
 * rendered via the ToolActivity UI in ChatMessage.tsx. File analysis and
 * code execution remain unwired.
 */
export function AgentMode({
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
  const { addMessage, setChatModels, patchChat, maybeAutoTitle, abort, removeMessagesAfter, updateMessage } = useChatStore();
  const [eagerWorkspace, setEagerWorkspace] = useState(false);
  const chatEndRef = useAutoScroll<HTMLDivElement>(chat?.messages ?? []);

  if (!chat) return null;

  const model = (chat.modelId ? findModel(chat.modelId) : undefined) ?? getDefaultModel();
  const effort = chat.effort ?? settings.effort;
  const generating = chat.messages.some((m) => m.streaming);

  const buildHistory = (upToId?: string): WireMessage[] => {
    const cutoff = upToId ? chat.messages.findIndex((m) => m.id === upToId) : chat.messages.length;
    return chat.messages
      .slice(0, cutoff)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        attachments: m.attachments?.map((a) => ({ name: a.name, type: a.type, dataUrl: a.dataUrl })),
      }));
  };

  const send = (text: string, attachments: Attachment[], codeMode?: boolean) => {
    if (codeMode || (settings.autoOpenCode && isCodingRequest(text))) setEagerWorkspace(true);
    const activeModel = model;
    if (!chat.modelId) setChatModels(chat.id, { modelId: activeModel.modelId });

    const userMsg: ChatMessageType = { id: uid(), role: "user", content: text, createdAt: Date.now(), attachments };
    addMessage(chat.id, userMsg);
    maybeAutoTitle(chat.id, text);

    const assistantMsg: ChatMessageType = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model: activeModel,
      streaming: true,
      toolCalls: [],
    };
    addMessage(chat.id, assistantMsg);

    const userWireAttachments = attachments.map((a) => ({
      name: a.name,
      type: a.type,
      dataUrl: a.dataUrl,
    }));
    const history: WireMessage[] = [
      ...buildHistory(),
      { role: "user", content: text, attachments: userWireAttachments },
    ];
    runAssistantStream({ chatId: chat.id, messageId: assistantMsg.id, model: activeModel, history, effort, webSearch: settings.autoWebSearch });
  };

  const regenerate = (assistantId: string, withModelId?: string) => {
    const runModel = (withModelId && findModel(withModelId)) || model;
    if (!runModel) return;
    const history = buildHistory(assistantId);
    removeMessagesAfter(chat.id, assistantId);
    const newAssistant: ChatMessageType = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model: runModel,
      streaming: true,
      toolCalls: [],
    };
    addMessage(chat.id, newAssistant);
    runAssistantStream({ chatId: chat.id, messageId: newAssistant.id, model: runModel, history, effort, webSearch: settings.autoWebSearch });
  };

  /** Resume a reply that was cut off at the model's output-token limit, appending in place. */
  const continueMessage = (assistantId: string) => {
    const msg = chat.messages.find((m) => m.id === assistantId);
    if (!msg || msg.role !== "assistant" || !msg.content) return;
    const runModel = msg.model ?? model;
    const history: WireMessage[] = [
      ...buildHistory(assistantId),
      { role: "assistant", content: msg.content },
      { role: "user", content: CONTINUE_NUDGE },
    ];
    updateMessage(chat.id, assistantId, { streaming: true, truncated: false });
    runAssistantStream({
      chatId: chat.id,
      messageId: assistantId,
      model: runModel,
      history,
      effort,
      webSearch: settings.autoWebSearch,
      appendToExisting: true,
    });
  };

  /** Edit a user message in-place and stream a fresh reply. */
  const editMessage = (messageId: string, newText: string) => {
    const msg = chat.messages.find((m) => m.id === messageId);
    if (!msg || msg.role !== "user") return;
    updateMessage(chat.id, messageId, { content: newText });
    const nextIdx = chat.messages.findIndex((m) => m.id === messageId) + 1;
    if (nextIdx < chat.messages.length) {
      const nextMsg = chat.messages[nextIdx];
      if (nextMsg.role === "assistant") removeMessagesAfter(chat.id, nextMsg.id);
    }
    // buildHistory(messageId) stops before the edited message — append the new text
    // explicitly so the model actually sees the edit (and the first message isn't
    // sent as an empty history).
    const wireAttachments = msg.attachments?.map((a) => ({ name: a.name, type: a.type, dataUrl: a.dataUrl }));
    const history: WireMessage[] = [
      ...buildHistory(messageId),
      { role: "user", content: newText, attachments: wireAttachments },
    ];
    const newAssistant: ChatMessageType = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model,
      streaming: true,
      toolCalls: [],
    };
    addMessage(chat.id, newAssistant);
    runAssistantStream({ chatId: chat.id, messageId: newAssistant.id, model, history, effort, webSearch: settings.autoWebSearch });
  };

  const stop = () => {
    const streamingMsg = chat.messages.find((m) => m.streaming);
    if (streamingMsg) abort(streamingMsg.id);
  };

  useEffect(() => {
    if (initialPrompt && chat.messages.length === 0) {
      send(initialPrompt.prompt, initialPrompt.attachments, initialPrompt.codeMode);
      onConsumeInitial?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id]);

  const completedArtifacts = chat.messages
    .filter((m) => m.role === "assistant" && !m.streaming && m.content)
    .map((m) => liveArtifactFor(m))
    .filter((a): a is NonNullable<typeof a> => !!a);
  const lastMsg = chat.messages[chat.messages.length - 1];
  const lastIsStreaming = lastMsg?.role === "assistant" && lastMsg.streaming;
  const liveArtifact = useLiveArtifact(lastIsStreaming ? lastMsg : undefined);
  const hasWorkspace = completedArtifacts.length > 0 || eagerWorkspace || !!liveArtifact;
  const latestArtifact = liveArtifact ?? completedArtifacts[completedArtifacts.length - 1] ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-base-700/60 px-5 py-3">
        <span className="text-xs font-medium text-slate-500">Model</span>
        <ModelSelector value={model} onChange={(m) => setChatModels(chat.id, { modelId: m.modelId })} />
        <EffortSelector value={effort} onChange={(e) => patchChat(chat.id, { effort: e })} />
        <div className="ml-auto flex items-center gap-1.5">
          {PLANNED_TOOLS.map((t) => (
            <span
              key={t.label}
              title="Not wired up yet — planned for a future update"
              className="flex cursor-default items-center gap-1 rounded-lg border border-dashed border-base-700/50 px-2 py-1 text-[11px] text-slate-600"
            >
              <t.icon size={11} />
              {t.label}
              <span className="ml-0.5 text-[9px] uppercase tracking-wide text-slate-700">soon</span>
            </span>
          ))}
        </div>
      </div>

      <ChatWorkspaceSplit
        hasWorkspace={hasWorkspace}
        workspaceStreaming={!!lastIsStreaming}
        chat={
          <>
            {chat.messages.length === 0 ? (
              <div className="flex-1">
                <EmptyState mode="agent" heading="What would you like Scribble to do?" onPick={(p) => send(p, [])} />
                <div className="mx-auto -mt-8 flex max-w-md items-start gap-2 rounded-xl border border-base-700/50 bg-base-900/40 px-3.5 py-2.5 text-xs text-slate-500">
                  <Lightbulb size={13} className="mt-0.5 shrink-0 text-accent-400" />
                  Agent Mode is built for multi-step tasks. Replies search the web automatically
                  when it'd help (toggle in Settings → General) — file analysis and code execution
                  are still on the way.
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8" ref={chatEndRef}>
                <div className={`mx-auto flex flex-col gap-5 ${hasWorkspace ? "" : "max-w-3xl"}`}>
                  {chat.messages.map((m, idx) => (
                    <ChatMessage
                      key={m.id}
                      message={m}
                      isLast={idx === chat.messages.length - 1}
                      suppressCode={hasWorkspace}
                      onRegenerate={m.role === "assistant" && !m.streaming ? () => regenerate(m.id) : undefined}
                      onRegenerateWith={
                        m.role === "assistant" && !m.streaming ? (modelId) => regenerate(m.id, modelId) : undefined
                      }
                      onContinue={
                        m.role === "assistant" && !m.streaming && m.truncated ? () => continueMessage(m.id) : undefined
                      }
                      onEdit={m.role === "user" && !m.streaming ? (newText) => editMessage(m.id, newText) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className={`w-full px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-8 ${hasWorkspace ? "" : "mx-auto max-w-3xl"}`}>
              <Composer onSend={send} onStop={stop} generating={generating} placeholder="Describe a task for the agent..." model={model} sendOnEnter={settings.sendOnEnter} />
            </div>
          </>
        }
        workspace={
          <ArtifactWorkspace
            panes={[{ key: "single", label: model.displayName, model, artifact: latestArtifact, streaming: !!lastIsStreaming }]}
          />
        }
      />
    </div>
  );
}
