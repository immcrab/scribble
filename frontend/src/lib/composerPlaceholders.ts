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

const PREFIX = "Ready to build ";
const TYPE_MS = 55;
const DELETE_MS = 28;
const HOLD_MS = 1700;
const GAP_MS = 350;

/** "Ready to build …" prompt that types out a random idea, holds, deletes it, then
 * types the next. `paused` freezes it (e.g. while the user is typing). */
export function useRotatingPlaceholder(enabled: boolean, paused: boolean): string {
  const [order] = useState(shuffled);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const full = `${order[index]}?`;
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!enabled || paused) return;
    let delay: number;
    let step: () => void;

    if (reduceMotion) {
      delay = HOLD_MS * 2;
      step = () => setIndex((i) => (i + 1) % order.length);
    } else if (!deleting && typed < full.length) {
      delay = TYPE_MS;
      step = () => setTyped((t) => t + 1);
    } else if (!deleting) {
      delay = HOLD_MS;
      step = () => setDeleting(true);
    } else if (typed > 0) {
      delay = DELETE_MS;
      step = () => setTyped((t) => t - 1);
    } else {
      delay = GAP_MS;
      step = () => {
        setDeleting(false);
        setIndex((i) => (i + 1) % order.length);
      };
    }

    const timer = window.setTimeout(step, delay);
    return () => window.clearTimeout(timer);
  }, [enabled, paused, reduceMotion, deleting, typed, full.length, order]);

  if (reduceMotion) return PREFIX + full;
  // Keep the prefix visible while the idea is empty so the placeholder never collapses.
  return PREFIX + full.slice(0, typed) + (typed < full.length || deleting ? "│" : "");
}
