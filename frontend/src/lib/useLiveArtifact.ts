import { useMemo } from "react";
import type { ChatMessage } from "../types";
import { extractArtifact, extractPartialArtifact, isArtifactWorthy, type Artifact } from "./codeArtifact";

/**
 * Parses a message's code artifact whether it's still streaming (lenient,
 * tolerates an unterminated trailing fence so the workspace panel fills in
 * live) or finished (strict). Centralizes what DirectMode/AgentMode/
 * BattleMode/SideBySideMode each used to duplicate as an inline `artifactFor`.
 */
export function useLiveArtifact(message?: ChatMessage): Artifact | null {
  return useMemo(() => {
    if (!message || message.role !== "assistant" || !message.content) return null;
    const parsed = message.streaming ? extractPartialArtifact(message.content) : extractArtifact(message.content);
    if (!parsed) return null;
    // While streaming, don't wait for the worthiness bar — any detected file
    // means code is being written and belongs in the panel, not the bubble.
    if (!message.streaming && !isArtifactWorthy(parsed)) return null;
    return parsed;
  }, [message?.content, message?.streaming, message?.role]);
}
