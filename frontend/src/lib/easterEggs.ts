/**
 * Small, harmless easter eggs. Everything here is purely visual: no requests, no
 * stored state beyond a "found" list in localStorage, and every animation is
 * skipped when the user (or their OS) asked for reduced motion.
 *
 *  - Konami code (↑↑↓↓←→←→BA) anywhere: confetti + toast.
 *  - Click the sidebar logo 7 times quickly: the logo does a barrel roll.
 *  - Send "do a barrel roll": the chat panel spins once (the message still sends).
 *  - Click an empty-state heading 5 times: it starts talking back (EmptyState.tsx).
 *  - Open the devtools console: a hello from the Lofin team (try lofin.hello()).
 *  - Poke the logo on the 404 page a few times.
 */

const FOUND_KEY = "lofin:eggs-found";
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

export function motionReduced(): boolean {
  if (typeof window === "undefined") return true;
  return (
    document.documentElement.classList.contains("motion-reduce-force") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Records an egg as found and returns how many distinct eggs the user has found. */
function markFound(id: string): number {
  try {
    const found = new Set<string>(JSON.parse(localStorage.getItem(FOUND_KEY) || "[]"));
    found.add(id);
    localStorage.setItem(FOUND_KEY, JSON.stringify([...found]));
    return found.size;
  } catch {
    return 1;
  }
}

let toastTimer: number | undefined;

export function eggToast(message: string, eggId?: string): void {
  const count = eggId ? markFound(eggId) : 0;
  document.getElementById("lofin-egg-toast")?.remove();
  window.clearTimeout(toastTimer);
  const el = document.createElement("div");
  el.id = "lofin-egg-toast";
  el.setAttribute("role", "status");
  el.className =
    "pointer-events-none fixed bottom-24 left-1/2 z-[200] flex animate-toast-in items-center gap-2 rounded-full border border-base-600/70 bg-base-850/95 px-4 py-2 text-sm font-medium text-slate-100 shadow-pop backdrop-blur-xl";
  el.style.transform = "translateX(-50%)";
  el.textContent = count > 0 ? `${message}  ·  ${count}/6 secrets found` : message;
  document.body.appendChild(el);
  toastTimer = window.setTimeout(() => {
    el.style.transition = "opacity 300ms ease";
    el.style.opacity = "0";
    window.setTimeout(() => el.remove(), 320);
  }, 3200);
}

const CONFETTI_COLORS = ["#f5f0eb", "#f9a8d4", "#93c5fd", "#fcd34d", "#86efac", "#c4b5fd"];

export function launchConfetti(pieces = 90): void {
  if (motionReduced()) return;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.className = "pointer-events-none fixed inset-0 z-[199] overflow-hidden";
  for (let i = 0; i < pieces; i++) {
    const p = document.createElement("span");
    const size = 6 + Math.random() * 6;
    p.className = "absolute top-0 block animate-confetti-fall rounded-[2px]";
    p.style.left = `${Math.random() * 100}%`;
    p.style.width = `${size}px`;
    p.style.height = `${size * (0.4 + Math.random() * 0.8)}px`;
    p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    p.style.animationDelay = `${Math.random() * 600}ms`;
    p.style.animationDuration = `${2200 + Math.random() * 1400}ms`;
    p.style.setProperty("--drift", `${(Math.random() - 0.5) * 240}px`);
    p.style.setProperty("--spin", `${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720)}deg`);
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 4400);
}

/** Spins an element once. */
export function barrelRoll(el: Element | null): void {
  if (!el || motionReduced()) return;
  el.classList.remove("animate-barrel-roll");
  // Force a reflow so the animation restarts if it is triggered twice in a row.
  void (el as HTMLElement).offsetWidth;
  el.classList.add("animate-barrel-roll");
  window.setTimeout(() => el.classList.remove("animate-barrel-roll"), 1100);
}

/** Called by the Composer before sending; never blocks the send. */
export function checkPromptEgg(text: string): void {
  if (/^\s*do a barrel roll[.!]*\s*$/i.test(text)) {
    barrelRoll(document.getElementById("main-content"));
    eggToast("Wheee!", "barrel-roll");
  }
}

let logoClicks: number[] = [];

/** Seven quick clicks on the logo within ~2.5s. */
export function registerLogoClick(logo: Element | null): void {
  const now = Date.now();
  logoClicks = [...logoClicks.filter((t) => now - t < 2500), now];
  if (logoClicks.length >= 7) {
    logoClicks = [];
    barrelRoll(logo);
    eggToast("You found the lofi room. Stay a while.", "logo");
  }
}

export function eggHeadingFound(): void {
  eggToast("Persistent, aren't you?", "heading");
}

let installed = false;

export function installEasterEggs(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  let pos = 0;
  window.addEventListener("keydown", (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    pos = key === KONAMI[pos] ? pos + 1 : key === KONAMI[0] ? 1 : 0;
    if (pos === KONAMI.length) {
      pos = 0;
      launchConfetti();
      eggToast("Cheat code accepted: +30 lives", "konami");
    }
  });

  try {
    console.log(
      "%cLofin%c\nLow-fi vibes, high-fi answers.\nPsst: try the Konami code, or ask for a barrel roll.",
      "font: 600 28px Georgia, serif; color: #f5f0eb; background: #1b1a18; padding: 6px 14px; border-radius: 8px;",
      "font: 13px system-ui; color: #9c9891;",
    );
    markFoundOnConsoleOpen();
  } catch {
    /* console styling unsupported — ignore */
  }
}

/** The console greeting itself counts as a found secret once someone reads it. */
function markFoundOnConsoleOpen(): void {
  (window as unknown as { lofin?: unknown }).lofin = {
    hello() {
      eggToast("Hello from the console!", "console");
      return "Hi! You found a secret.";
    },
  };
  console.log("%cType lofin.hello() for a surprise.", "font: 12px system-ui; color: #9c9891;");
}
