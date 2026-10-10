import { useAuthStore } from "../state/authStore";
import { useChatStore } from "../state/chatStore";
import type { ArtifactFile } from "./codeArtifact";

export interface PublishedWebsite {
  url: string;
  expiresAt: number;
  slug: string;
}

function workerBase(): string {
  return useChatStore.getState().settings.workerUrl.replace(/\/$/, "");
}

/**
 * Stores the artifact's original files in R2 and returns its seven-day public URL.
 * Pass the `slug` of a site published earlier to overwrite it in place (same URL).
 */
export async function publishWebsite(files: ArtifactFile[], slug?: string): Promise<PublishedWebsite> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error("Sign in to publish a website.");
  const response = await fetch(`${workerBase()}/api/websites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({ files: files.map(({ name, content }) => ({ name, content })), slug }),
  });
  const body = await response.json().catch(() => null) as Partial<PublishedWebsite> & { error?: string } | null;
  if (!response.ok || !body?.url || !body.expiresAt || !body.slug) {
    throw new Error(body?.error || `Could not publish website (${response.status}).`);
  }
  return { url: body.url, expiresAt: body.expiresAt, slug: body.slug };
}
