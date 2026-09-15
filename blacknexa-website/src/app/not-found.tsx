import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-7 py-[clamp(80px,10vw,132px)] text-center">
      <p className="text-[11px] font-semibold tracking-[0.22em] text-accent">404</p>
      <h1 className="mt-[18px] font-serif text-[clamp(1.9rem,4vw,2.8rem)] font-bold leading-[1.1] tracking-[-0.02em] text-text-primary">
        This page doesn&rsquo;t exist.
      </h1>
      <p className="mt-4 max-w-[52ch] text-[15px] leading-[1.7] text-text-secondary">
        The page you&rsquo;re looking for may have moved or never existed. Head back home, or
        reach out if you think this is a mistake.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/">
          <Button type="button">Back to home</Button>
        </Link>
        <Link href="/contact">
          <Button type="button" variant="outline">
            Contact us
          </Button>
        </Link>
      </div>
    </div>
  );
}
