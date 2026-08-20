/**
 * Minimal path-based router: each chat lives at "<base>/c/{id}" (e.g.
 * "/scribble/c/f3a1..."). No router library — the app only ever needs to
 * read/write this one route shape, so plain History API is enough. Deep
 * links work on GitHub Pages via the index.html/404.html redirect pair.
 */

function normalizeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function parseChatIdFromLocation(): string | null {
  const match = window.location.pathname.match(/\/c\/([^/]+)\/?$/);
  return match ? normalizeId(match[1]) : null;
}

export function chatPath(id: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/c/${encodeURIComponent(id)}`;
}

/** Points the address bar at `id`'s chat. Pushes a new history entry when already on
 * some chat's URL (so back/forward moves between chats); replaces when landing from a
 * bare "/" so the implicit first redirect doesn't leave a dead entry in history. */
export function syncUrlToChat(id: string): void {
  const target = chatPath(id);
  if (window.location.pathname === target) return;
  const onChatPath = /\/c\/[^/]+\/?$/.test(window.location.pathname);
  if (onChatPath) {
    window.history.pushState({ chatId: id }, "", target);
  } else {
    window.history.replaceState({ chatId: id }, "", target);
  }
}

/** Fires on browser back/forward. Handler receives the chat id now in the URL, or null
 * if the URL no longer points at a chat. */
export function onPopState(handler: (chatId: string | null) => void): () => void {
  const listener = () => handler(parseChatIdFromLocation());
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}
