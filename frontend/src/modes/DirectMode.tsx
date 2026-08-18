import { useEffect, useState } from "react";
import { useChatStore } from "../state/chatStore";
import { ALL_MODELS, findModel } from "../config/models";
import { ChatMessage } from "../components/ChatMessage";
import { Composer } from "../components/Composer";
import { ModelSelector } from "../components/ModelSelector";
import { EmptyState } from "../components/EmptyState";
import { ArtifactWorkspace } from "../components/ArtifactWorkspace";
import { extractArtifact, isArtifactWorthy } from "../lib/codeArtifact";
import { runAssistantStream } from "../lib/runStream";
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
  const { addMessage, setChatModels, maybeAutoTitle, abort, removeMessagesAfter } = useChatStore();
  const [eagerWorkspace, setEagerWorkspace] = useState(false);

  if (!chat) return null;

  const model = chat.modelId ? findModel(chat.modelId) : undefined;
  const generating = chat.messages.some((m) => m.streaming);

  const buildHistory = (upToId?: string): WireMessage[] => {
    const cutoff = upToId ? chat.messages.findIndex((m) => m.id === upToId) : chat.messages.length;
    return chat.messages
      .slice(0, cutoff)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  };

  const send = (text: string, attachments: Attachment[], codeMode?: boolean) => {
    if (codeMode) setEagerWorkspace(true);
    const activeModel = model ?? ALL_MODELS[0];
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

    const history: WireMessage[] = [...buildHistory(), { role: "user", content: text }];
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
  const hasWorkspace = completedArtifacts.length > 0 || eagerWorkspace;
  const lastMsg = chat.messages[chat.messages.length - 1];
  const lastIsStreaming = lastMsg?.role === "assistant" && lastMsg.streaming;
  const latestArtifact = completedArtifacts[completedArtifacts.length - 1] ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-base-700/60 px-5 py-3">
        <span className="text-xs font-medium text-slate-500">Model</span>
        <ModelSelector
          value={model}
          onChange={(m) => setChatModels(chat.id, { modelId: m.modelId })}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={`flex min-h-0 flex-col ${hasWorkspace ? "w-full max-w-md shrink-0 border-r border-base-700/60" : "flex-1"}`}>
          {chat.messages.length === 0 ? (
            <div className="flex-1">
              <EmptyState onPick={(p) => send(p, [])} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8">
              <div className={`mx-auto flex flex-col gap-5 ${hasWorkspace ? "" : "max-w-3xl"}`}>
                {chat.messages.map((m) => (
                  <ChatMessage
                    key={m.id}
                    message={m}
                    onRegenerate={m.role === "assistant" && !m.streaming ? () => regenerate(m.id) : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          <div className={`w-full px-4 pb-5 sm:px-8 ${hasWorkspace ? "" : "mx-auto max-w-3xl"}`}>
            <Composer onSend={send} onStop={stop} generating={generating} />
          </div>
        </div>

        {hasWorkspace && (
          <div className="min-w-0 flex-1">
            <ArtifactWorkspace
              panes={[{ key: "single", label: model?.displayName ?? "Preview", artifact: latestArtifact, streaming: !!lastIsStreaming }]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
