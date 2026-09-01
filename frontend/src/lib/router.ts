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

/** Projects live at "<base>/p/{id}" — same deep-link mechanism as "/c/{id}". */
export function parseProjectIdFromLocation(): string | null {
  const match = window.location.pathname.match(/\/p\/([^/]+)\/?$/);
  return match ? normalizeId(match[1]) : null;
}

/** True only for the bare app root ("/" or "<base>/"), where the app shows a fresh
 * compose screen rather than any particular chat. */
export function isRootLocation(): boolean {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = window.location.pathname;
  return path === base || path === `${base}/`;
}

/** Every path shape the SPA itself renders: root, a chat, or docs. Anything else
 * (typos, dead links, stray paths) is a real 404 — it must not fall back to
 * whatever chat happened to be active last. */
export function isKnownAppLocation(): boolean {
  if (isRootLocation()) return true;
  if (parseChatIdFromLocation() !== null) return true;
  if (parseProjectIdFromLocation() !== null) return true;
  if (parseDocsSlugFromLocation() !== null) return true;
  if (isAuthActionLocation()) return true;
  if (isAdminLocation()) return true;
  if (isUsageLocation()) return true;
  if (isTutorLocation()) return true;
  return false;
}

/** "<base>/tutor" — the writing tutor that learns the user's own voice (see pages/TutorPage.tsx). */
export function isTutorLocation(): boolean {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = window.location.pathname;
  return path === `${base}/tutor` || path === `${base}/tutor/`;
}

export function tutorPath(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/tutor`;
}

/** "<base>/usage" — the signed-in user's daily credit dashboard (see pages/UsagePage.tsx). */
export function isUsageLocation(): boolean {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = window.location.pathname;
  return path === `${base}/usage` || path === `${base}/usage/`;
}

export function usagePath(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/usage`;
}

/** "<base>/admin" — the shared-catalog editor (see pages/AdminPage.tsx). The page itself
 * gates on the signed-in account; the route is "known" for anyone so a non-admin lands on
 * the page's own "not authorized" state rather than a 404. */
export function isAdminLocation(): boolean {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = window.location.pathname;
  return path === `${base}/admin` || path === `${base}/admin/`;
}

export function adminPath(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/admin`;
}

/** "<base>/auth/action" — where Firebase's verification / password-reset / email-
 * recovery links land once a custom action URL is set in the Firebase console.
 * Handled by pages/AuthActionPage.tsx. */
export function isAuthActionLocation(): boolean {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = window.location.pathname;
  return path === `${base}/auth/action` || path === `${base}/auth/action/`;
}

export function chatPath(id: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/c/${encodeURIComponent(id)}`;
}

export function projectPath(id: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/p/${encodeURIComponent(id)}`;
}

/** Points the address bar at a project. Pushes when moving between app locations,
 * replaces when already on this project's URL. */
export function syncUrlToProject(id: string): void {
  const target = projectPath(id);
  if (window.location.pathname === target) return;
  window.history.pushState({ projectId: id }, "", target);
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

/**
 * Docs section lives at "<base>/docs" (index) and "<base>/docs/{slug}" (one model
 * each) — same deep-link mechanism as "/c/{id}" above, via the 404.html/index.html
 * redirect pair. `null` means "not a docs URL", `""` means the docs index.
 */
export function parseDocsSlugFromLocation(): string | null {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = window.location.pathname;
  if (path === `${base}/docs` || path === `${base}/docs/`) return "";
  const match = path.match(/\/docs\/([^/]+)\/?$/);
  return match ? normalizeId(match[1]) : null;
}

export function docsPath(slug?: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return slug ? `${base}/docs/${encodeURIComponent(slug)}` : `${base}/docs`;
}

export function pushDocsPath(slug?: string): void {
  window.history.pushState(null, "", docsPath(slug));
}
