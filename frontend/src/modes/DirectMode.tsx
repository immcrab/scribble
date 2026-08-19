import { useEffect, useState } from "react";
import { useChatStore } from "../state/chatStore";
import { getDefaultModel, findModel } from "../config/models";
import { ChatMessage } from "../components/ChatMessage";
import { Composer } from "../components/Composer";
import { ModelSelector } from "../components/ModelSelector";
import { EmptyState } from "../components/EmptyState";
import { ArtifactWorkspace } from "../components/ArtifactWorkspace";
import { ChatWorkspaceSplit } from "../components/ChatWorkspaceSplit";
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
  const { addMessage, setChatModels, maybeAutoTitle, abort, removeMessagesAfter } = useChatStore();
  const [eagerWorkspace, setEagerWorkspace] = useState(false);
  const chatEndRef = useAutoScroll<HTMLDivElement>(chat?.messages ?? []);

  if (!chat) return null;

  const model = (chat.modelId ? findModel(chat.modelId) : undefined) ?? getDefaultModel();
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
    runAssistantStream({ chatId: chat.id, messageId: assistantMsg.id, model: activeModel, history });
  };

  const regenerate = (assistantId: string) => {
    if (!model) return;
    const history = buildHistory(assistantId);
    removeMessagesAfter(chat.id, assistantId);
    const newAssistant: ChatMessageType = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model,
      streaming: true,
    };
    addMessage(chat.id, newAssistant);
    runAssistantStream({ chatId: chat.id, messageId: newAssistant.id, model, history });
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
      <div className="flex items-center gap-2 border-b border-base-700/60 px-5 py-3">
        <span className="text-xs font-medium text-slate-500">Model</span>
        <ModelSelector
          value={model}
          onChange={(m) => setChatModels(chat.id, { modelId: m.modelId })}
        />
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
                  {chat.messages.map((m) => (
                    <ChatMessage
                      key={m.id}
                      message={m}
                      suppressCode={hasWorkspace}
                      onRegenerate={m.role === "assistant" && !m.streaming ? () => regenerate(m.id) : undefined}
                    />
                  ))}
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
