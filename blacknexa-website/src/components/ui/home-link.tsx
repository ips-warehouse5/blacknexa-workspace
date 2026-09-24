"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";

type Props = Omit<ComponentProps<typeof Link>, "href">;

/**
 * Link to the homepage for the brand logo.
 *
 * `next/link` to "/" does nothing when you are already on "/", so clicking the
 * logo halfway down the homepage looked broken. On the homepage this scrolls
 * back to the top instead (and drops any `#section` from the URL); everywhere
 * else it is an ordinary link home.
 */
export function HomeLink({ onClick, ...props }: Props) {
  const pathname = usePathname();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || pathname !== "/") return;
    // Let modified clicks (new tab/window) behave normally.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (window.location.hash) window.history.replaceState(null, "", "/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <Link href="/" onClick={handleClick} {...props} />;
}
