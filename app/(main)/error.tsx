"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { AlertTriangle } from "lucide-react";

/**
 * What a page under the main layout shows when its server render throws —
 * most often the database or a provider being unreachable. The navbar and
 * footer stay, so the user is not dropped out of the app.
 */
export default function MainError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Page failed to render:", error);
  }, [error]);

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-xl px-4 py-16 text-center sm:px-6">
        <div role="alert"><EmptyState pageHeading icon={<AlertTriangle className="size-7" />} title="This page could not be loaded" description={<>Something went wrong while fetching it. Your saved plans and trips are not affected.{error.digest && <> Reference: {error.digest}</>}</>} action={<div className="mt-3 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={retry} className={buttonVariants({ size: "md" })}>
            Try again
          </button>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "md" })}>
            Back to planner
          </Link>
        </div>} /></div>
      </div>
    </main>
  );
}
