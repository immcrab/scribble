import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Native tooltip + accessible name when `label` is purely visual. */
  title?: string;
}

/**
 * Radio-style segmented control with a single thumb that slides (and resizes)
 * between options. Thumb geometry is measured from the real option rects, so it
 * works for any label width and survives font changes. Styles: `.seg*` in index.css.
 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
  className = "",
  buttonClassName = "",
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  buttonClassName?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const active = wrap.querySelector<HTMLElement>('[aria-checked="true"]');
      if (!active) return setThumb(null);
      setThumb({ x: active.offsetLeft, w: active.offsetWidth });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [value, options.length]);

  return (
    <div ref={wrapRef} role="radiogroup" aria-label={ariaLabel} className={`seg ${className}`}>
      {thumb && <span aria-hidden="true" className="seg-thumb" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} />}
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`seg-btn ${buttonClassName}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
