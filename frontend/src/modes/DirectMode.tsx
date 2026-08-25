import { useEffect, useState } from "react";
import { useChatStore } from "../state/chatStore";
import { getDefaultModel, findModel } from "../config/models";
import { ChatMessage } from "../components/ChatMessage";
import { Composer } from "../components/Composer";
import { ModelSelector } from "../components/ModelSelector";
import { EffortSelector } from "../components/EffortSelector";
import { WebSearchToggle } from "../components/WebSearchToggle";
import { EmptyState } from "../components/EmptyState";
import { ArtifactWorkspace } from "../components/ArtifactWorkspace";
import { ChatWorkspaceSplit } from "../components/ChatWorkspaceSplit";
import { AdUnit } from "../components/AdUnit";
import { extractArtifact, isArtifactWorthy, isCodingRequest } from "../lib/codeArtifact";
import { useLiveArtifact } from "../lib/useLiveArtifact";
import { runAssistantStream } from "../lib/runStream";
import { useAutoScroll } from "../lib/useAutoScroll";
import { uid } from "../lib/id";
import type { Attachment, ChatMessage as ChatMessageType } from "../types";
import type { WireMessage } from "../providers";
import type { InitialPrompt } from "../App";

export function DirectMode({
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
  const [webSearch, setWebSearch] = useState(false);
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

    const userMsg: ChatMessageType = {
      id: uid(),
      role: "user",
      content: text,
      createdAt: Date.now(),
      attachments,
    };
    addMessage(chat.id, userMsg);
    maybeAutoTitle(chat.id, text);

    const assistantMsg: ChatMessageType = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model: activeModel,
      streaming: true,
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
    runAssistantStream({ chatId: chat.id, messageId: assistantMsg.id, model: activeModel, history, effort, webSearch });
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
    };
    addMessage(chat.id, newAssistant);
    runAssistantStream({ chatId: chat.id, messageId: newAssistant.id, model: runModel, history, effort, webSearch });
  };

  /** Edit a user message in-place and stream a fresh reply. */
  const editMessage = (messageId: string, newText: string) => {
    const msg = chat.messages.find((m) => m.id === messageId);
    if (!msg || msg.role !== "user") return;
    updateMessage(chat.id, messageId, { content: newText });
    // Remove the assistant response that followed this user message, if any.
    const nextIdx = chat.messages.findIndex((m) => m.id === messageId) + 1;
    if (nextIdx < chat.messages.length) {
      const nextMsg = chat.messages[nextIdx];
      if (nextMsg.role === "assistant") removeMessagesAfter(chat.id, nextMsg.id);
    }
    // Re-send from this edited user message onward.
    const history = buildHistory(messageId);
    const newAssistant: ChatMessageType = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model,
      streaming: true,
    };
    addMessage(chat.id, newAssistant);
    runAssistantStream({ chatId: chat.id, messageId: newAssistant.id, model, history, effort, webSearch });
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
    .map((m) => extractArtifact(m.content))
    .filter((a): a is NonNullable<typeof a> => !!a && isArtifactWorthy(a));
  const lastMsg = chat.messages[chat.messages.length - 1];
  const lastIsStreaming = lastMsg?.role === "assistant" && lastMsg.streaming;
  const liveArtifact = useLiveArtifact(lastIsStreaming ? lastMsg : undefined);
  const hasWorkspace = completedArtifacts.length > 0 || eagerWorkspace || !!liveArtifact;
  const latestArtifact = liveArtifact ?? completedArtifacts[completedArtifacts.length - 1] ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-base-700/60 px-5 py-3">
        <span className="text-xs font-medium text-slate-500">Model</span>
        <ModelSelector
          value={model}
          onChange={(m) => setChatModels(chat.id, { modelId: m.modelId })}
        />
        <div className="ml-auto flex items-center gap-2">
          <WebSearchToggle checked={webSearch} onChange={setWebSearch} />
          <EffortSelector value={effort} onChange={(e) => patchChat(chat.id, { effort: e })} />
        </div>
      </div>

      <ChatWorkspaceSplit
        hasWorkspace={hasWorkspace}
        workspaceStreaming={!!lastIsStreaming}
        chat={
          <>
            {chat.messages.length === 0 ? (
              <div className="flex-1">
                <EmptyState onPick={(p) => send(p, [])} />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8" ref={chatEndRef}>
                <div className={`mx-auto flex flex-col gap-5 ${hasWorkspace ? "" : "max-w-3xl"}`}>
                  {(() => {
                    let sinceAd = 0;
                    let gap = 2;
                    return chat.messages.map((m) => {
                      // Slim ad card every 2-3 completed replies (alternating
                      // gap) — never sits next to the composer, shown on
                      // mobile too since this list has no md:hidden guard.
                      let showAdAfter = false;
                      if (m.role === "assistant" && !m.streaming) {
                        sinceAd++;
                        if (sinceAd >= gap) {
                          showAdAfter = true;
                          sinceAd = 0;
                          gap = gap === 2 ? 3 : 2;
                        }
                      }
                      return (
                        <div key={m.id} className="flex flex-col gap-5">
                          <ChatMessage
                            message={m}
                            suppressCode={hasWorkspace}
                            onRegenerate={m.role === "assistant" && !m.streaming ? () => regenerate(m.id) : undefined}
                            onRegenerateWith={
                              m.role === "assistant" && !m.streaming ? (modelId) => regenerate(m.id, modelId) : undefined
                            }
                            onEdit={m.role === "user" && !m.streaming ? (newText) => editMessage(m.id, newText) : undefined}
                          />
                          {showAdAfter && <AdUnit slot="0000000001" width={320} height={80} />}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            <div className={`w-full px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-8 ${hasWorkspace ? "" : "mx-auto max-w-3xl"}`}>
              <Composer onSend={send} onStop={stop} generating={generating} model={model} sendOnEnter={settings.sendOnEnter} />
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
