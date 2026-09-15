/**
 * Marks a spot where a real production asset is required. No stock
 * or invented brand imagery is substituted — this renders a clearly
 * labeled placeholder so the missing asset is obvious to whoever
 * wires up real photography/video next.
 */
export function ImagePlaceholder({
  label,
  aspect = "16 / 10",
  className = "",
}: {
  label: string;
  aspect?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center border border-dashed border-border bg-surface-elevated p-6 text-center ${className}`}
      style={{ aspectRatio: aspect }}
      role="img"
      aria-label={label}
    >
      <span className="text-[12px] leading-[1.5] tracking-wide text-text-muted">{label}</span>
    </div>
  );
}
