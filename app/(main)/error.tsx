"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";

/**
 * What a page under the main layout shows when its server render throws —
 * most often the database or a provider being unreachable. The navbar and
 * footer stay, so the user is not dropped out of the app.
 */
export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page failed to render:", error);
  }, [error]);

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          This page could not be loaded
        </h1>
        <p role="alert" className="mt-3 text-sm text-muted-foreground">
          Something went wrong while fetching it. Your saved plans and trips are not affected.
        </p>
        {/* The reference is what to quote when reporting it; the error's own
            text is kept out of the page. */}
        {error.digest && (
          <p className="mt-2 text-xs text-muted-foreground">Reference: {error.digest}</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className={buttonVariants({ size: "md" })}>
            Try again
          </button>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "md" })}>
            Back to planner
          </Link>
        </div>
      </div>
    </main>
  );
}
