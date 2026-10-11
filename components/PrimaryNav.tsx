"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCurrentPath, PRIMARY_LINKS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * The app's destinations, on every signed-in page.
 *
 * Navigation used to be a strip on the home page and a list in the footer, so
 * the only way from one page to another was back through the planner — and
 * Scheduled trips had no link at all when nothing was scheduled. The current
 * page is marked for sighted users and, with aria-current, for everyone else.
 */
export default function PrimaryNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className={className}>
      {/* Scrolls sideways on a phone rather than wrapping to two rows or
          hiding behind a menu button: five short links fit with a swipe. */}
      <ul className="flex items-center gap-1 overflow-x-auto">
        {PRIMARY_LINKS.map((link) => {
          const current = isCurrentPath(link.href, pathname);

          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "block rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  current
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
