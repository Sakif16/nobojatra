import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { MapPinOff } from "lucide-react";

export const metadata: Metadata = { title: "Page not found" };

/** Any address the app does not have, including one typed or shared wrongly. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <EmptyState pageHeading icon={<MapPinOff className="size-7" />} title="404 · This page does not exist" description="The link may be mistyped, or the trip it pointed to may have been removed." action={<div className="mt-3">
          <Link href="/" className={buttonVariants({ size: "md" })}>
            Back to planner
          </Link>
        </div>} />
      </div>
    </main>
  );
}
