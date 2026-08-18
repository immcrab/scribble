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
  const { addMessage, setChatModels, maybeAutoTitle, abort } = useChatStore();
  const [eagerWorkspace, setEagerWorkspace] = useState(false);

  if (!chat) return null;

  const modelA = chat.modelAId ? findModel(chat.modelAId) : ALL_MODELS[0];
  const modelB = chat.modelBId ? findModel(chat.modelBId) : ALL_MODELS[1];
  const generating = chat.messages.some((m) => m.streaming);
  const rounds = groupRounds(chat.messages);
  const lastRound = rounds[rounds.length - 1];

  const buildHistory = (pane: "a" | "b", upToId?: string): WireMessage[] => {
    const cutoff = upToId ? chat.messages.findIndex((m) => m.id === upToId) : chat.messages.length;
    return chat.messages
      .slice(0, cutoff)
      .filter((m) => m.role === "user" || m.pane === pane)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  };

  const send = (text: string, attachments: Attachment[], codeMode?: boolean) => {
    if (codeMode) setEagerWorkspace(true);
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

    const historyA: WireMessage[] = [...buildHistory("a"), { role: "user", content: text }];
    const historyB: WireMessage[] = [...buildHistory("b"), { role: "user", content: text }];

    runAssistantStream({ chatId: chat.id, messageId: aMsg.id, model: modelA, history: historyA });
    runAssistantStream({ chatId: chat.id, messageId: bMsg.id, model: modelB, history: historyB });
  };

  const stop = () => {
    for (const m of chat.messages) {
      if (m.streaming) abort(m.id);
    }
  };

  const locked = chat.messages.length > 0;

  useEffect(() => {
    if (initialPrompt && chat.messages.length === 0) {
      send(initialPrompt.prompt, initialPrompt.attachments, initialPrompt.codeMode);
      onConsumeInitial?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id]);

  const artifactFor = (m?: ChatMessageType) =>
    m && !m.streaming && m.content ? extractArtifact(m.content) : null;

  const hasWorkspace =
    eagerWorkspace ||
    rounds.some((r) => {
      const aa = artifactFor(r.a);
      const bb = artifactFor(r.b);
      return (aa && isArtifactWorthy(aa)) || (bb && isArtifactWorthy(bb));
    });

  const lastArtifactA = artifactFor(lastRound?.a);
  const lastArtifactB = artifactFor(lastRound?.b);

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
          onChange={(m) => !locked && setChatModels(chat.id, { modelBId: m.modelId })}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={`flex min-h-0 flex-col ${hasWorkspace ? "w-full max-w-md shrink-0 border-r border-base-700/60" : "flex-1"}`}>
          {chat.messages.length === 0 ? (
            <div className="flex-1">
              <EmptyState heading="Compare two models you choose" onPick={(p) => send(p, [])} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8">
              <div className={`mx-auto flex flex-col gap-6 ${hasWorkspace ? "" : "max-w-5xl"}`}>
                {rounds.map((round) => (
                  <div key={round.user.id} className="flex flex-col gap-4">
                    <div className="flex justify-end">
                      <div className="max-w-[80%]">
                        <ChatMessage message={round.user} />
                      </div>
                    </div>
                    <div className={hasWorkspace ? "flex flex-col gap-4" : "grid grid-cols-1 gap-4 md:grid-cols-2"}>
                      <div className="min-w-0 rounded-2xl border border-base-700/50 bg-base-900/40 p-3">
                        {round.a && <ChatMessage message={round.a} />}
                      </div>
                      <div className="min-w-0 rounded-2xl border border-base-700/50 bg-base-900/40 p-3">
                        {round.b && <ChatMessage message={round.b} />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`w-full px-4 pb-5 sm:px-8 ${hasWorkspace ? "" : "mx-auto max-w-5xl"}`}>
            <Composer onSend={send} onStop={stop} generating={generating} placeholder="Send the same prompt to both models..." />
          </div>
        </div>

        {hasWorkspace && (
          <div className="min-w-0 flex-1">
            <ArtifactWorkspace
              panes={[
                { key: "a", label: modelA?.displayName ?? "Model A", artifact: lastArtifactA, streaming: !!lastRound?.a?.streaming },
                { key: "b", label: modelB?.displayName ?? "Model B", artifact: lastArtifactB, streaming: !!lastRound?.b?.streaming },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
