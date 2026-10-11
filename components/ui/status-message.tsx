import { cn } from "@/lib/utils";

/**
 * The one way to tell the user how something went.
 *
 * Errors, progress and confirmations were each written inline wherever they
 * were needed, so whether a screen reader announced a failure depended on
 * which screen produced it. An error here is always `role="alert"`, which is
 * announced at once; anything else is `role="status"`, announced when the
 * reader is next idle. The look goes with the tone.
 */
const TONE_STYLES = {
  error: "bg-destructive/10 text-destructive",
  info: "border border-border bg-muted/60 text-muted-foreground",
  success: "border border-primary/30 bg-primary/10 text-primary",
} as const;

export type StatusTone = keyof typeof TONE_STYLES;

export default function StatusMessage({
  tone = "error",
  size = "md",
  className,
  children,
}: {
  tone?: StatusTone;
  size?: "sm" | "md";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        size === "sm" ? "rounded-xl px-3 py-2 text-xs" : "rounded-2xl px-4 py-3 text-sm",
        TONE_STYLES[tone],
        className,
      )}
    >
      {children}
    </p>
  );
}
