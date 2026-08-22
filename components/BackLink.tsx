import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * The one back control in the app.
 *
 * Several screens are reachable only by following a chain — planner → fares →
 * best options — and left the browser's own back button as the only way out.
 * That is not navigation a page can rely on: it is missing in standalone/PWA
 * display modes, and it means something different from "up one step" whenever
 * the user arrived from elsewhere. Each caller therefore names where back
 * goes, rather than calling history.back().
 *
 * Rendered directly above the page's <h1> so it reads as part of the heading
 * block, not as an action among the page's own controls.
 */
export default function BackLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground ${className ?? ""}`}
    >
      <ArrowLeft className="size-4" aria-hidden />
      {label}
    </Link>
  );
}
