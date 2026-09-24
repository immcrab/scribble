export function LogoMark({ size = 15, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path d="M7.3 22.8c1.8 2.2 4.5 3.6 7.7 3.6 5.5 0 9.7-4.2 9.7-9.7 0-3.1-1.4-5.9-3.6-7.7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M10.8 9.2c-2.2 1.8-3.6 4.5-3.6 7.7 0 1.4.3 2.7.8 3.9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".5" />
      <path d="M17.2 5.7c.55 3.42 1.7 5.04 5.12 5.6-3.42.55-5.04 1.7-5.6 5.12-.55-3.42-1.7-5.04-5.12-5.6 3.42-.55 5.04-1.7 5.6-5.12Z" fill="currentColor" />
      <circle cx="22.9" cy="22.2" r="2.1" fill="currentColor" />
    </svg>
  );
}
