import { ArrowLeft, CalendarClock, MapPinned, Route } from "lucide-react";
import Link from "next/link";
import RouteArtwork from "@/components/auth/RouteArtwork";

const highlights = [
  { icon: <MapPinned className="size-4" />, label: "Up to 6 stops per trip" },
  { icon: <Route className="size-4" />, label: "3 ranked route options" },
  { icon: <CalendarClock className="size-4" />, label: "Schedule 7 days ahead" },
];

// Auth lives outside the main shell so these pages render full-bleed with no
// navbar — a "Sign Up" button in the header while you are on the signup page is
// just noise competing with the form.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-card lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,color-mix(in_oklch,var(--primary),transparent_86%),transparent_55%)]"
        />
        <RouteArtwork
          className="pointer-events-none absolute -right-16 bottom-0 h-[560px] w-[560px] text-foreground opacity-[0.13]"
        />

        <div className="relative">
          <Link href="/" className="text-lg font-semibold text-foreground">
            NoboJatra
          </Link>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold tracking-tight text-balance text-foreground">
            Plan smarter routes across Dhaka
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            নতুন যাত্রা শুরু হোক
          </p>

          <ul className="mt-10 space-y-3">
            {highlights.map((highlight) => (
              <li
                key={highlight.label}
                className="flex items-center gap-3 text-sm text-muted-foreground"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-primary">
                  {highlight.icon}
                </span>
                {highlight.label}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          © {new Date().getFullYear()} NoboJatra
        </p>
      </aside>

      <div className="flex flex-col">
        <header className="flex items-center justify-between px-6 py-6 sm:px-10">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
          <span className="text-sm font-semibold text-foreground lg:hidden">
            NoboJatra
          </span>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 pb-16 sm:px-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  );
}
