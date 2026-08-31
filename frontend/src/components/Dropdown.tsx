import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Headless open/close + click-outside wrapper shared by every custom
 * dropdown in the app (ModelSelector, ModeSelector, and Settings' new
 * pickers) — previously each one hand-rolled its own ref + mousedown
 * listener. Trigger and menu content stay fully custom via render props;
 * this just owns the interaction mechanics and the consistent panel chrome.
 *
 * Uses `pointerdown` (not just `mousedown`) so it fires immediately on
 * touch devices — `mousedown` is delayed ~300ms on mobile, which made
 * dropdowns feel sluggish and caused phantom clicks.
 *
 * On open, it measures the trigger against the viewport and flips the menu
 * above the trigger when there isn't room for it below (short window, or a
 * trigger near the bottom edge).
 */
export function Dropdown({
  trigger,
  children,
  align = "left",
  menuClassName = "",
}: {
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode;
  children: (state: { close: () => void }) => ReactNode;
  align?: "left" | "right";
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [drop, setDrop] = useState<"down" | "up">("down");
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const trigEl = ref.current?.firstElementChild as HTMLElement | undefined;
    const rect = trigEl?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    // Flip up only when below is genuinely cramped and above has more room.
    setDrop(spaceBelow < 280 && spaceAbove > spaceBelow ? "up" : "down");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // `pointerdown` covers mouse, touch, and pen — fires instantly on touch.
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={`absolute z-30 origin-top overflow-y-auto rounded-xl border border-base-600/70 bg-base-850 shadow-panel backdrop-blur-xl animate-fade-in-up ${
            drop === "up" ? "bottom-full mb-2" : "top-full mt-2"
          } ${align === "right" ? "right-0" : "left-0"} ${menuClassName}`}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}
