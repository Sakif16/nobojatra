import { cn } from "@/lib/utils";

/**
 * The one input shape in the app — auth forms, the trip form and profile all
 * use it (rounded-xl, secondary fill, generous padding) so every surface reads
 * as one design rather than several. Its 44px height matches the `form` button
 * size in ./button so submits line up with the fields above them.
 */
export function fieldClassName(hasError?: boolean, extra?: string) {
  return cn(
    "w-full rounded-xl border bg-secondary/60 px-4 py-3 text-sm text-foreground transition outline-none placeholder:text-muted-foreground focus:bg-secondary focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60",
    hasError
      ? "border-destructive focus:border-destructive focus:ring-destructive/30"
      : "border-input focus:border-ring focus:ring-ring/30",
    extra
  );
}
