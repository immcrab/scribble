import { useEffect, useState } from "react";

const IDEAS = [
  "a new website",
  "a landing page",
  "a browser game",
  "a portfolio site",
  "a dashboard",
  "a weather app",
  "a todo app",
  "a chatbot",
  "a REST API",
  "a Chrome extension",
  "a Discord bot",
  "a budget tracker",
  "a pixel-art editor",
  "a recipe finder",
  "a markdown editor",
  "a habit tracker",
  "a startup pitch deck",
  "an online store",
  "a flashcard app",
  "a music player",
  "a link shortener",
  "a snake game",
  "a blog from scratch",
  "a data visualization",
  "a calculator with style",
  "a kanban board",
  "a countdown timer",
  "a personal wiki",
  "a quiz app",
  "something wild",
];

function shuffled(): string[] {
  const out = [...IDEAS];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A "Ready to build …" prompt that swaps to a fresh random idea every few seconds.
 * `paused` freezes it (e.g. while the user is typing) so it never changes under them. */
export function useRotatingPlaceholder(enabled: boolean, paused: boolean, intervalMs = 3800): string {
  const [order] = useState(shuffled);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!enabled || paused) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % order.length), intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, paused, intervalMs, order]);

  return `Ready to build ${order[index]}?`;
}
