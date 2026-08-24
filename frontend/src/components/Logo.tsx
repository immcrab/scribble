export function LogoMark({ size = 15, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
      <path
        d="M16 6c1 6 3 9 10 10-7 1-9 4-10 10-1-6-3-9-10-10 7-1 9-4 10-10Z"
        fill="currentColor"
      />
    </svg>
  );
}
