import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

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
  const Icon = tone === "error" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        size === "sm" ? "rounded-xl px-3 py-2 text-xs" : "rounded-xl px-3 py-2.5 text-sm",
        "flex items-start gap-2",
        TONE_STYLES[tone],
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
