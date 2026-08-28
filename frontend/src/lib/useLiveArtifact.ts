import { useMemo } from "react";
import type { ChatMessage } from "../types";
import { extractArtifact, extractPartialArtifact, isArtifactWorthy, type Artifact } from "./codeArtifact";

/**
 * Parses a message's code artifact whether it's still streaming or truncated
 * (lenient — tolerates an unterminated trailing fence so the workspace panel
 * fills in live, and a cut-off response still shows what it got) or cleanly
 * finished (strict). Centralizes what DirectMode/AgentMode/BattleMode/
 * SideBySideMode each used to duplicate as an inline `artifactFor`.
 */
export function liveArtifactFor(message?: ChatMessage): Artifact | null {
  if (!message || message.role !== "assistant" || !message.content) return null;
  const lenient = !!message.streaming || !!message.truncated;
  const parsed = lenient ? extractPartialArtifact(message.content) : extractArtifact(message.content);
  if (!parsed) return null;
  // While streaming or after a truncation, don't wait for the worthiness bar —
  // any detected file means code is (was) being written and belongs in the panel.
  if (!lenient && !isArtifactWorthy(parsed)) return null;
  return parsed;
}

export function useLiveArtifact(message?: ChatMessage): Artifact | null {
  return useMemo(
    () => liveArtifactFor(message),
    [message?.content, message?.streaming, message?.truncated, message?.role]
  );
}
