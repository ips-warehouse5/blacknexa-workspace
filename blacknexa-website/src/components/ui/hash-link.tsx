"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";

type Props = ComponentProps<typeof Link>;

/**
 * Wraps `next/link` for internal `/#section` links so repeat clicks always
 * scroll, even when the URL's hash already equals the target.
 *
 * Root cause this fixes: browsers (and next/link, which relies on the
 * browser's native hash-navigation) only scroll to an anchor when the hash
 * actually *changes*. The first click on e.g. "Join the waitlist" sets the
 * URL to `/#waitlist` and scrolls correctly. If the user then scrolls
 * elsewhere and clicks the same link again, the hash is already
 * `#waitlist` — nothing changes, so nothing scrolls, and the button looks
 * dead. This affects every same-page hash link (nav items, footer links,
 * "Join the waitlist" CTAs), not just one button.
 *
 * Fix: when already on the link's target page, intercept the click and
 * scroll to the element ourselves every time, regardless of the current
 * hash. Cross-page hash links (e.g. clicking "/#waitlist" from /contact)
 * are untouched — that's a real navigation and the browser handles the
 * initial scroll correctly on its own.
 */
export function HashLink({ href, onClick, ...props }: Props) {
  const pathname = usePathname();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    const hrefStr = href.toString();
    const hashIndex = hrefStr.indexOf("#");

    if (hashIndex !== -1) {
      const targetPath = hrefStr.slice(0, hashIndex) || "/";
      const id = hrefStr.slice(hashIndex + 1);

      if (targetPath === pathname) {
        const el = document.getElementById(id);
        if (el) {
          e.preventDefault();
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          if (window.location.hash !== `#${id}`) {
            window.history.pushState(null, "", `#${id}`);
          }
        }
      }
    }

    onClick?.(e);
  }

  return <Link href={href} onClick={handleClick} {...props} />;
}
