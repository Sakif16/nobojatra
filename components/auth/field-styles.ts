import { cn } from "@/lib/utils";

/**
 * Shared input shape for the auth forms. Matches the trip form's inputs
 * (rounded-xl, secondary fill, generous padding) so the auth flow and the
 * product surface read as one design rather than two.
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
