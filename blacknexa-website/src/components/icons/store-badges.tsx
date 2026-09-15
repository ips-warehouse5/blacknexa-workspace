/**
 * Apple and Google Play glyphs used inside the "coming soon" store
 * badges (Hero + Final CTA). Kept separate from the generic 24×24
 * outline `Icon` set since these are fixed-geometry brand marks with
 * their own viewBoxes, not part of that icon family.
 */

export function AppleLogo({ width = 17, height = 20 }: { width?: number; height?: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 17 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M13.9 10.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8C4.5 5.3 3 6.3 2.2 7.8c-1.6 2.8-.4 6.9 1.1 9.2.8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7 1.4 0 1.8.7 3 .7 1.2 0 2-1.1 2.8-2.2.9-1.3 1.3-2.6 1.3-2.6-.1 0-2.4-.9-2.4-3.9ZM11.4 3.6c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.8 1 .1 2.1-.5 2.8-1.3Z" />
    </svg>
  );
}

export function GooglePlayLogo({ width = 17, height = 19 }: { width?: number; height?: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 17 19"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M1.4 1.1 10.6 9.5 1.4 17.9c-.3-.2-.5-.6-.5-1.1V2.2c0-.5.2-.9.5-1.1Z" />
      <path d="M12.2 7.9 14.9 9.5c.9.5.9 1.3 0 1.8l-2.7 1.6-2-2.4 2-2.6Z" />
      <path d="M2.4.7 11.3 6l-1.8 2.3L2.4.7Zm0 17.6L9.5 10.7l1.8 2.3-8.9 5.3Z" />
    </svg>
  );
}
