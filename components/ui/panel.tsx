import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export default function Panel({ className, padding = "md", ...props }: HTMLAttributes<HTMLDivElement> & { padding?: "none" | "sm" | "md" | "lg" }) {
  return <div {...props} className={cn("rounded-2xl border border-border bg-card", { none: "", sm: "p-3", md: "p-4", lg: "p-6" }[padding], className)} />;
}
