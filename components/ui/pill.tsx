import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export default function Pill({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cn("inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground", className)} />;
}
