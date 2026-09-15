export function BlackNexaLogo({
  size = 30,
  withWordmark = true,
  className = "",
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  const height = Math.round((size * 56) / 48);
  return (
    <span className={`inline-flex items-center gap-[10px] ${className}`}>
      <svg
        width={size}
        height={height}
        viewBox="0 0 48 56"
        fill="none"
        aria-hidden="true"
        className="block shrink-0"
      >
        <path
          d="M24 2.6 44.2 9.4V28.2C44.2 41 35.4 50.2 24 53.8 12.6 50.2 3.8 41 3.8 28.2V9.4Z"
          stroke="var(--bn-accent)"
          strokeWidth="3.1"
          strokeLinejoin="round"
        />
        <path
          d="M24 12.6 35.4 16.5V28.4C35.4 36.2 30.2 41.8 24 44.4 17.8 41.8 12.6 36.2 12.6 28.4V16.5Z"
          fill="var(--bn-accent)"
        />
      </svg>
      {withWordmark ? (
        <span className="flex items-start gap-[2px] font-serif text-[22px] font-bold leading-none tracking-[-0.005em] text-current">
          BlackNexa
          <span className="pt-[2px] text-[9px] font-medium tracking-[0.04em] opacity-75">TM</span>
        </span>
      ) : null}
    </span>
  );
}
