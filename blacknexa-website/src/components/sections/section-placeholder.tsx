/**
 * Stands in for a homepage section whose data is still streaming in.
 *
 * It keeps the section's `id`, so `/#news` and `/#faq` links land on the
 * right place even before the data arrives, and reserves roughly the section's
 * height so the content below does not jump when it swaps in.
 */
export function SectionPlaceholder({
  id,
  className,
}: {
  id: string;
  /** Tailwind min-height classes approximating the loaded section. */
  className: string;
}) {
  return (
    <section id={id} aria-busy="true" className={`bg-surface-elevated ${className}`}>
      <span className="sr-only">Loading…</span>
    </section>
  );
}
