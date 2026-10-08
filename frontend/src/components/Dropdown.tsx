import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "../lib/useMediaQuery";

/**
 * Headless open/close wrapper shared by every custom dropdown in the app
 * (ModelSelector, ModeSelector, Settings' pickers, …). Trigger and menu
 * content stay fully custom via render props; this owns the interaction
 * mechanics and the consistent panel chrome.
 *
 * The menu renders in a portal on <body> at the popover layer (z-[70], above
 * modals at z-50/60), positioned with `position: fixed` from the trigger's
 * measured rect. It used to be an `absolute` child of the trigger, which put it
 * inside whatever stacking context the trigger lived in — on narrow viewports
 * the ModeSelector menu then overlapped the empty-state cards while sitting
 * *behind* them for hit-testing, so tapping "Image" hit "Build a dashboard".
 *
 * Interaction:
 *  - Outside `pointerdown` dismisses (fires immediately on touch). On mobile
 *    widths a transparent backdrop catches that tap instead, so dismissing a
 *    menu can never also activate whatever was underneath it.
 *  - Escape closes and returns focus to the trigger.
 *  - Focus moves into the menu on open and Tab/Shift+Tab are trapped in it.
 *  - Arrow Up/Down, Home and End move between the menu's buttons.
 */

/** Everything inside the menu that keyboard focus can land on. */
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
/** The subset arrow keys step through — rows, not the search box. */
const ITEMS = 'button:not([disabled]):not([data-no-arrow]), [role="menuitem"], [role="option"]';
const VIEWPORT_MARGIN = 8;
const GAP = 8;

type Pos = { top: number; left: number; maxHeight: number; width?: number; placement: "down" | "up" };

export function Dropdown({
  trigger,
  children,
  align = "left",
  menuClassName = "",
  matchWidth = false,
  label,
  mobileSheet = false,
  role = "dialog",
}: {
  trigger: (state: { open: boolean; toggle: () => void; menuId: string }) => ReactNode;
  children: (state: { close: () => void }) => ReactNode;
  align?: "left" | "right";
  menuClassName?: string;
  /** Size the menu to the trigger's width (Settings' full-width pickers). */
  matchWidth?: boolean;
  /** Accessible name for the menu panel. */
  label?: string;
  /** Below the `sm` breakpoint, present the menu as a bottom sheet instead of a popover. */
  mobileSheet?: boolean;
  /** "menu" for plain lists of actions/choices; "dialog" when the panel holds inputs. */
  role?: "menu" | "dialog";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const isMobile = useIsMobile();
  const asSheet = mobileSheet && isMobile;

  const triggerEl = () => anchorRef.current?.firstElementChild as HTMLElement | null | undefined;

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    setPos(null);
    if (restoreFocus) triggerEl()?.focus();
  }, []);

  const toggle = useCallback(() => {
    setOpen((o) => {
      if (o) setPos(null);
      return !o;
    });
  }, []);

  // Measure the trigger and the rendered menu, then place the menu below (or above,
  // when below is cramped) the trigger, clamped inside the viewport.
  const reposition = useCallback(() => {
    const trig = triggerEl();
    const menu = menuRef.current;
    if (!trig || !menu) return;
    const r = trig.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = matchWidth ? r.width : undefined;
    const menuW = Math.min(width ?? menu.offsetWidth, vw - VIEWPORT_MARGIN * 2);
    const naturalH = menu.scrollHeight;
    const below = vh - r.bottom - GAP - VIEWPORT_MARGIN;
    const above = r.top - GAP - VIEWPORT_MARGIN;
    const placement: Pos["placement"] = below < Math.min(naturalH, 280) && above > below ? "up" : "down";
    const maxHeight = Math.max(120, placement === "down" ? below : above);
    const h = Math.min(naturalH, maxHeight);
    let left = align === "right" ? r.right - menuW : r.left;
    left = Math.min(Math.max(VIEWPORT_MARGIN, left), vw - menuW - VIEWPORT_MARGIN);
    const top = placement === "down" ? r.bottom + GAP : r.top - GAP - h;
    setPos({ top, left, maxHeight, width, placement });
  }, [align, matchWidth]);

  useLayoutEffect(() => {
    if (!open || asSheet) return;
    reposition();
  }, [open, asSheet, reposition]);

  // Keep the menu glued to its trigger while anything scrolls or the window resizes,
  // and re-measure when the menu's own content changes size (filtering a list, etc.).
  useEffect(() => {
    if (!open || asSheet) return;
    const onMove = () => reposition();
    window.addEventListener("resize", onMove);
    document.addEventListener("scroll", onMove, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onMove) : null;
    if (ro && menuRef.current) ro.observe(menuRef.current);
    return () => {
      window.removeEventListener("resize", onMove);
      document.removeEventListener("scroll", onMove, true);
      ro?.disconnect();
    };
  }, [open, asSheet, reposition]);

  // Outside-press dismissal (desktop — mobile uses the backdrop below).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  // Move focus into the menu once it's placed: an explicit [data-autofocus] element,
  // else the selected row, else the first focusable thing.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const menu = menuRef.current;
      if (!menu || menu.contains(document.activeElement)) return;
      const target =
        menu.querySelector<HTMLElement>("[data-autofocus]") ??
        menu.querySelector<HTMLElement>('[aria-current="true"], [aria-selected="true"], [aria-checked="true"]') ??
        menu.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus({ preventScroll: false });
    });
    return () => cancelAnimationFrame(id);
  }, [open, pos === null]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const menu = menuRef.current;
    if (!menu) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key === "Tab") {
      const focusables = Array.from(menu.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const active = document.activeElement as HTMLElement | null;
    // Home/End belong to a text field's caret; only arrows leave a search box.
    if (active?.tagName === "INPUT" && (e.key === "Home" || e.key === "End")) return;
    const items = Array.from(menu.querySelectorAll<HTMLElement>(ITEMS));
    if (items.length === 0) return;
    e.preventDefault();
    const idx = active ? items.indexOf(active) : -1;
    let next: number;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else if (e.key === "ArrowDown") next = idx < 0 ? 0 : (idx + 1) % items.length;
    else next = idx < 0 ? items.length - 1 : (idx - 1 + items.length) % items.length;
    items[next].focus();
  };

  // Escape while focus is still on the trigger (menu just opened by mouse).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !menuRef.current?.contains(document.activeElement)) close(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const content = children({ close: () => close() });

  return (
    <div ref={anchorRef} className="relative" data-dropdown-open={open || undefined}>
      {trigger({ open, toggle, menuId })}
      {open &&
        createPortal(
          <>
            {(isMobile || asSheet) && (
              // Swallows the dismissing tap so it can't click through to the page.
              <div
                aria-hidden="true"
                data-testid="dropdown-backdrop"
                className={`fixed inset-0 z-[69] ${asSheet ? "bg-black/50 animate-fade-in" : ""}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => close()}
              />
            )}
            <div
              ref={menuRef}
              id={menuId}
              role={role}
              aria-label={label}
              data-dropdown-menu=""
              onKeyDown={onMenuKeyDown}
              style={
                asSheet
                  ? undefined
                  : {
                      top: pos?.top ?? 0,
                      left: pos?.left ?? 0,
                      maxHeight: pos?.maxHeight,
                      width: pos?.width,
                      visibility: pos ? "visible" : "hidden",
                    }
              }
              className={
                asSheet
                  ? "popover-layer fixed inset-x-0 bottom-0 z-[70] flex max-h-[85dvh] flex-col overflow-y-auto overscroll-contain rounded-t-2xl border border-b-0 border-base-600/70 bg-base-850 pb-[env(safe-area-inset-bottom)] shadow-pop animate-sheet-in"
                  : `popover-layer fixed z-[70] overflow-y-auto overscroll-contain rounded-xl border border-base-600/70 bg-base-850 shadow-pop backdrop-blur-xl ${
                      !pos ? "origin-top" : pos.placement === "up" ? "origin-bottom animate-menu-in-up" : "origin-top animate-menu-in"
                    } ${menuClassName}`
              }
            >
              {asSheet && <div aria-hidden="true" className="mx-auto mb-1 mt-2 h-1 w-10 shrink-0 rounded-full bg-base-600" />}
              {content}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
