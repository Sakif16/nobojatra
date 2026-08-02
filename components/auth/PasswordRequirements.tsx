"use client";

import { Check, X } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/password";
import { cn } from "@/lib/utils";

type Props = {
  password: string;
};

export default function PasswordRequirements({ password }: Props) {
  // Stay quiet until there is something to judge, so an untouched form does not
  // open with a wall of red crosses.
  if (password.length === 0) return null;

  return (
    <ul aria-live="polite" className="mt-3 space-y-1.5">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);

        return (
          <li
            key={rule.id}
            className={cn(
              "flex items-center gap-2 text-xs transition-colors",
              met ? "text-primary" : "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "flex size-4 flex-shrink-0 items-center justify-center rounded-full transition-colors",
                met ? "bg-primary/15" : "bg-muted"
              )}
            >
              {met ? <Check size={10} /> : <X size={10} />}
            </span>
            {rule.label}
            <span className="sr-only">{met ? " — met" : " — not met"}</span>
          </li>
        );
      })}
    </ul>
  );
}
