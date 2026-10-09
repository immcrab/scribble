import { useEffect, useRef, type RefObject } from "react";

/**
 * Little emoji characters that walk around inside `containerRef`. They head for the mouse
 * while it's over the container, wander on their own when it isn't, and doze off after a
 * while of standing still. Extra buddies follow the one in front of them, conga-line style.
 * Positions live in refs and are written straight to the DOM each frame — no re-renders.
 */
export function CodeBuddies({
  containerRef,
  emoji,
  count,
}: {
  containerRef: RefObject<HTMLElement | null>;
  emoji: string;
  count: number;
}) {
  const n = Math.max(1, Math.min(3, Math.round(count)));
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const zzz = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const size = () => container.getBoundingClientRect();
    let { width, height } = size();
    const buddies = Array.from({ length: n }, (_, i) => ({
      x: 40 + i * 30,
      y: height - 40,
      facing: 1,
      phase: Math.random() * 6,
      still: 0,
    }));
    let mouse: { x: number; y: number } | null = null;
    let lastMouse = 0;
    let wander = { x: width / 2, y: height / 2 };
    let nextWander = 0;

    const onMove = (e: PointerEvent) => {
      const r = size();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      lastMouse = performance.now();
    };
    const onLeave = () => {
      mouse = null;
    };
    const ro = new ResizeObserver(() => ({ width, height } = size()));
    ro.observe(container);
    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerleave", onLeave);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const chasing = mouse && now - lastMouse < 6000;
      if (!chasing && now > nextWander) {
        wander = { x: 30 + Math.random() * Math.max(0, width - 60), y: 50 + Math.random() * Math.max(0, height - 90) };
        nextWander = now + 3500 + Math.random() * 4000;
      }
      buddies.forEach((b, i) => {
        const lead = i === 0 ? (chasing ? mouse! : wander) : buddies[i - 1];
        // Stand a little below-left of the cursor so it doesn't sit under the pointer.
        const tx = i === 0 && chasing ? lead.x - 18 * b.facing : lead.x;
        const ty = i === 0 && chasing ? lead.y + 22 : lead.y;
        const dx = tx - b.x;
        const dy = ty - b.y;
        const dist = Math.hypot(dx, dy);
        const stop = i === 0 ? 6 : 30;
        let moving = false;
        if (dist > stop) {
          const speed = (dist > 220 ? 190 : 95) * (i === 0 ? 1 : 1.1);
          const step = Math.min(dist - stop, speed * dt);
          b.x += (dx / dist) * step;
          b.y += (dy / dist) * step;
          if (Math.abs(dx) > 2) b.facing = dx > 0 ? 1 : -1;
          b.phase += dt * 14;
          moving = true;
          b.still = 0;
        } else {
          b.still += dt;
        }
        b.x = Math.max(12, Math.min(width - 12, b.x));
        b.y = Math.max(16, Math.min(height - 12, b.y));
        const bob = moving ? Math.abs(Math.sin(b.phase)) * -5 : 0;
        const tilt = moving ? Math.sin(b.phase) * 8 : 0;
        const el = nodes.current[i];
        // Most emoji face left, so flip to face right when walking right.
        if (el) el.style.transform = `translate(${b.x - 14}px, ${b.y - 28 + bob}px) scaleX(${-b.facing}) rotate(${tilt}deg)`;
        const z = zzz.current[i];
        if (z) z.style.opacity = b.still > 7 ? "1" : "0";
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
    };
  }, [containerRef, n]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            nodes.current[i] = el;
          }}
          className="absolute left-0 top-0 h-7 w-7 text-center text-2xl leading-7 drop-shadow-[0_3px_2px_rgba(0,0,0,0.35)] will-change-transform"
          style={{ fontSize: i === 0 ? 24 : 20 }}
        >
          {emoji}
          <span
            ref={(el) => {
              zzz.current[i] = el;
            }}
            className="absolute -right-2 -top-3 text-[11px] opacity-0 transition-opacity duration-700"
          >
            💤
          </span>
        </div>
      ))}
    </div>
  );
}
