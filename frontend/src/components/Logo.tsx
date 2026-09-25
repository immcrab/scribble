export function LogoMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={(size * 461) / 516}
      height={size}
      viewBox="431 363 461 516"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M431 413A50 50 0 0 1 510 368L600 430A60 60 0 0 1 642 490V773A105.5 105.5 0 0 1 431 773Z"
        fill="#f8ede1"
      />
      <path
        d="M640 723H815A77.5 77.5 0 0 1 815 878H545Q500 878 475 850L548 774Q585 723 640 723Z"
        fill="#918579"
        fillOpacity=".81"
      />
    </svg>
  );
}
