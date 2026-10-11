import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

/** Any address the app does not have, including one typed or shared wrongly. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
          This page does not exist
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The link may be mistyped, or the trip it pointed to may have been removed.
        </p>
        <div className="mt-6">
          <Link href="/" className={buttonVariants({ size: "md" })}>
            Back to planner
          </Link>
        </div>
      </div>
    </main>
  );
}
