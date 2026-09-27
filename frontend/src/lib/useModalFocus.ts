import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus management: moves focus into `ref` on mount (unless something inside
 * already has it), keeps Tab/Shift+Tab inside it, and hands focus back to whatever
 * had it before the modal opened when it unmounts. Escape handling stays with each
 * modal, since several already commit state on close.
 */
export function useModalFocus(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const visible = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);

    const id = requestAnimationFrame(() => {
      if (el.contains(document.activeElement)) return;
      (el.querySelector<HTMLElement>("[data-autofocus]") ?? visible()[0] ?? el).focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      // A popover portaled out of the modal owns its own trap while open.
      if (document.querySelector("[data-dropdown-menu]")?.contains(document.activeElement)) return;
      const f = visible();
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (!el.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey);
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [ref]);
}
