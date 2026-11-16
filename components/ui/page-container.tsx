import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The page column for pages without a map. Two widths only, so pages line up
 * with each other: `narrow` for one thing to read (a trip summary), `wide`
 * for lists and settings.
 */
export default function PageContainer({
  width = "wide",
  className,
  children,
  ...props
}: {
  width?: "narrow" | "wide";
  className?: string;
  children: ReactNode;
  "aria-busy"?: boolean;
}) {
  return (
    <main className="flex-1" {...props}>
      <div className={cn("mx-auto w-full px-4 py-10 sm:px-6 lg:px-8", width === "narrow" ? "max-w-2xl" : "max-w-5xl", className)}>
        {children}
      </div>
    </main>
  );
}
