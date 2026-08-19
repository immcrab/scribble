import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Headless open/close + click-outside wrapper shared by every custom
 * dropdown in the app (ModelSelector, ModeSelector, and Settings' new
 * pickers) — previously each one hand-rolled its own ref + mousedown
 * listener. Trigger and menu content stay fully custom via render props;
 * this just owns the interaction mechanics and the consistent panel chrome.
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={`absolute top-full z-30 mt-2 origin-top overflow-y-auto rounded-xl border border-base-600/70 bg-base-850/95 shadow-panel backdrop-blur-xl animate-fade-in-up ${
            align === "right" ? "right-0" : "left-0"
          } ${menuClassName}`}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}
