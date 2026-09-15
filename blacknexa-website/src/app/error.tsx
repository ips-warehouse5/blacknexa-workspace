"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-7 py-[clamp(80px,10vw,132px)] text-center">
      <p className="text-[11px] font-semibold tracking-[0.22em] text-accent">ERROR</p>
      <h1 className="mt-[18px] font-serif text-[clamp(1.9rem,4vw,2.8rem)] font-bold leading-[1.1] tracking-[-0.02em] text-text-primary">
        Something went wrong.
      </h1>
      <p className="mt-4 max-w-[52ch] text-[15px] leading-[1.7] text-text-secondary">
        This page hit an unexpected error. Try again, or head back home.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Link href="/">
          <Button type="button" variant="outline">
            Back to home
          </Button>
        </Link>
      </div>
    </div>
  );
}
