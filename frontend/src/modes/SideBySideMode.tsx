import { useEffect, useState } from "react";
import { useChatStore } from "../state/chatStore";
import { getDefaultModel, findModel } from "../config/models";
import { ChatMessage } from "../components/ChatMessage";
import { Composer } from "../components/Composer";
import { ModelSelector } from "../components/ModelSelector";
import { EffortSelector } from "../components/EffortSelector";
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

interface Round {
  user: ChatMessageType;
  a?: ChatMessageType;
  b?: ChatMessageType;
}

function groupRounds(messages: ChatMessageType[]): Round[] {
  const rounds: Round[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      rounds.push({ user: m });
    } else if (rounds.length) {
      const round = rounds[rounds.length - 1];
      if (m.pane === "a") round.a = m;
      else if (m.pane === "b") round.b = m;
    }
  }
  return rounds;
}

export function SideBySideMode({
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
  const { addMessage, setChatModels, patchChat, maybeAutoTitle, abort, removeMessagesAfter } = useChatStore();
  const [eagerWorkspace, setEagerWorkspace] = useState(false);
  const chatEndRef = useAutoScroll<HTMLDivElement>(chat?.messages ?? []);

  if (!chat) return null;

  const modelA = chat.modelAId ? findModel(chat.modelAId) : getDefaultModel();
  const modelB = chat.modelBId ? findModel(chat.modelBId) : getDefaultModel();
  const effort = chat.effort ?? settings.effort;
  const generating = chat.messages.some((m) => m.streaming);
  const rounds = groupRounds(chat.messages);
  const lastRound = rounds[rounds.length - 1];

  const buildHistory = (pane: "a" | "b", upToId?: string): WireMessage[] => {
    const cutoff = upToId ? chat.messages.findIndex((m) => m.id === upToId) : chat.messages.length;
    return chat.messages
      .slice(0, cutoff)
      .filter((m) => m.role === "user" || m.pane === pane)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        attachments: m.attachments?.map((a) => ({ name: a.name, type: a.type, dataUrl: a.dataUrl })),
      }));
  };

  const send = (text: string, attachments: Attachment[], codeMode?: boolean) => {
    if (codeMode || (settings.autoOpenCode && isCodingRequest(text))) setEagerWorkspace(true);
    if (!chat.modelAId || !chat.modelBId) {
      setChatModels(chat.id, { modelAId: modelA!.modelId, modelBId: modelB!.modelId });
    }
    if (!modelA || !modelB) return;

    const userMsg: ChatMessageType = { id: uid(), role: "user", content: text, createdAt: Date.now(), attachments };
    addMessage(chat.id, userMsg);
    maybeAutoTitle(chat.id, text);

    const aMsg: ChatMessageType = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model: modelA,
      pane: "a",
      streaming: true,
    };
    const bMsg: ChatMessageType = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model: modelB,
      pane: "b",
      streaming: true,
    };
    addMessage(chat.id, aMsg);
    addMessage(chat.id, bMsg);

    const userWireAttachments = attachments.map((a) => ({
      name: a.name,
      type: a.type,
      dataUrl: a.dataUrl,
    }));
    const historyA: WireMessage[] = [
      ...buildHistory("a"),
      { role: "user", content: text, attachments: userWireAttachments },
    ];
    const historyB: WireMessage[] = [
      ...buildHistory("b"),
      { role: "user", content: text, attachments: userWireAttachments },
    ];

    runAssistantStream({ chatId: chat.id, messageId: aMsg.id, model: modelA, history: historyA, effort, webSearch: settings.autoWebSearch });
    runAssistantStream({ chatId: chat.id, messageId: bMsg.id, model: modelB, history: historyB, effort, webSearch: settings.autoWebSearch });
  };

  const stop = () => {
    for (const m of chat.messages) {
      if (m.streaming) abort(m.id);
    }
  };

  const locked = chat.messages.length > 0;

  /** Resend a user message to both models. */
  const resendUser = (userId: string) => {
    const userMsg = chat.messages.find((m) => m.id === userId);
    if (!userMsg || !modelA || !modelB) return;
    removeMessagesAfter(chat.id, userId);
    const aMsg: ChatMessageType = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model: modelA,
      pane: "a",
      streaming: true,
    };
    const bMsg: ChatMessageType = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model: modelB,
      pane: "b",
      streaming: true,
    };
    addMessage(chat.id, aMsg);
    addMessage(chat.id, bMsg);
    const userWireAttachments = userMsg.attachments?.map((a) => ({
      name: a.name,
      type: a.type,
      dataUrl: a.dataUrl,
    })) ?? [];
    const historyA: WireMessage[] = [
      ...buildHistory("a", userId),
      { role: "user", content: userMsg.content, attachments: userWireAttachments },
    ];
    const historyB: WireMessage[] = [
      ...buildHistory("b", userId),
      { role: "user", content: userMsg.content, attachments: userWireAttachments },
    ];
    runAssistantStream({ chatId: chat.id, messageId: aMsg.id, model: modelA, history: historyA, effort, webSearch: settings.autoWebSearch });
    runAssistantStream({ chatId: chat.id, messageId: bMsg.id, model: modelB, history: historyB, effort, webSearch: settings.autoWebSearch });
  };

  /** Regenerate just one pane for the current round. */
  const regeneratePane = (pane: "a" | "b") => {
    if (!lastRound || !lastRound.user || generating) return;
    const old = pane === "a" ? lastRound.a : lastRound.b;
    if (!old || !old.model) return;
    removeMessagesAfter(chat.id, old.id);
    const newMsg: ChatMessageType = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model: old.model,
      pane,
      streaming: true,
    };
    addMessage(chat.id, newMsg);
    const userWireAttachments = lastRound.user.attachments?.map((a) => ({
      name: a.name,
      type: a.type,
      dataUrl: a.dataUrl,
    })) ?? [];
    const history: WireMessage[] = [
      ...buildHistory(pane, old.id),
      { role: "user", content: lastRound.user.content, attachments: userWireAttachments },
    ];
    runAssistantStream({ chatId: chat.id, messageId: newMsg.id, model: old.model, history, effort, webSearch: settings.autoWebSearch });
  };

  useEffect(() => {
    if (initialPrompt && chat.messages.length === 0) {
      send(initialPrompt.prompt, initialPrompt.attachments, initialPrompt.codeMode);
      onConsumeInitial?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id]);

  const artifactFor = (m?: ChatMessageType) =>
    m && !m.streaming && m.content ? extractArtifact(m.content) : null;

  const liveArtifactA = useLiveArtifact(lastRound?.a?.streaming ? lastRound.a : undefined);
  const liveArtifactB = useLiveArtifact(lastRound?.b?.streaming ? lastRound.b : undefined);

  const hasWorkspace =
    eagerWorkspace ||
    !!liveArtifactA ||
    !!liveArtifactB ||
    rounds.some((r) => {
      const aa = artifactFor(r.a);
      const bb = artifactFor(r.b);
      return (aa && isArtifactWorthy(aa)) || (bb && isArtifactWorthy(bb));
    });

  const lastArtifactA = liveArtifactA ?? artifactFor(lastRound?.a);
  const lastArtifactB = liveArtifactB ?? artifactFor(lastRound?.b);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-base-700/60 px-5 py-3">
        <span className="text-xs font-medium text-slate-500">Model A</span>
        <ModelSelector
          value={modelA}
          onChange={(m) => !locked && setChatModels(chat.id, { modelAId: m.modelId })}
        />
        <span className="mx-1 text-xs text-slate-600">vs</span>
        <span className="text-xs font-medium text-slate-500">Model B</span>
        <ModelSelector
          value={modelB}
          align="right"
          onChange={(m) => !locked && setChatModels(chat.id, { modelBId: m.modelId })}
        />
        <div className="ml-auto flex items-center gap-2">
          <EffortSelector value={effort} onChange={(e) => patchChat(chat.id, { effort: e })} />
        </div>
      </div>

      <ChatWorkspaceSplit
        hasWorkspace={hasWorkspace}
        workspaceStreaming={!!lastRound?.a?.streaming || !!lastRound?.b?.streaming}
        chat={
          <>
            {chat.messages.length === 0 ? (
              <div className="flex-1">
                <EmptyState heading="Compare two models you choose" onPick={(p) => send(p, [])} />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8" ref={chatEndRef}>
                <div className={`mx-auto flex flex-col gap-6 ${hasWorkspace ? "" : "max-w-5xl"}`}>
                  {rounds.map((round, i) => {
                    const isLast = i === rounds.length - 1;
                    const roundRevealed = !!round.a && !!round.b && !round.a.streaming && !round.b.streaming;
                    return (
                      <div key={round.user.id} className="flex flex-col gap-4">
                        <div className="flex justify-end">
                          <div className="max-w-[80%]">
                            <ChatMessage
                              message={round.user}
                              onRegenerate={() => resendUser(round.user.id)}
                            />
                          </div>
                        </div>
                        <div className={hasWorkspace ? "flex flex-col gap-4" : "grid grid-cols-1 gap-4 md:grid-cols-2"}>
                          <div className="min-w-0 rounded-2xl border border-base-700/50 bg-base-900/40 p-3">
                            {round.a && (
                              <ChatMessage
                                message={round.a}
                                suppressCode={hasWorkspace}
                                onRegenerate={roundRevealed && isLast ? () => regeneratePane("a") : undefined}
                              />
                            )}
                          </div>
                          <div className="min-w-0 rounded-2xl border border-base-700/50 bg-base-900/40 p-3">
                            {round.b && (
                              <ChatMessage
                                message={round.b}
                                suppressCode={hasWorkspace}
                                onRegenerate={roundRevealed && isLast ? () => regeneratePane("b") : undefined}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className={`w-full px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-8 ${hasWorkspace ? "" : "mx-auto max-w-5xl"}`}>
              <Composer
                onSend={send}
                onStop={stop}
                generating={generating}
                placeholder="Send the same prompt to both models..."
                model={[modelA, modelB].find((m) => m && !m.supportsVision) ?? modelA}
                sendOnEnter={settings.sendOnEnter}
              />
            </div>
          </>
        }
        workspace={
          <ArtifactWorkspace
            panes={[
              { key: "a", label: modelA?.displayName ?? "Model A", model: modelA, artifact: lastArtifactA, streaming: !!lastRound?.a?.streaming },
              { key: "b", label: modelB?.displayName ?? "Model B", model: modelB, artifact: lastArtifactB, streaming: !!lastRound?.b?.streaming },
            ]}
          />
        }
      />
    </div>
  );
}
