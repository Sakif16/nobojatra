import {
  BellRing,
  CalendarClock,
  MapPinned,
  Route,
  TrafficCone,
  Wallet,
} from "lucide-react";
import BackToSignIn from "@/components/auth/BackToSignIn";
import RouteArtwork from "@/components/auth/RouteArtwork";
import { COUNTRY_CONFIG, COUNTRY_OPTIONS } from "@/lib/country-config";

// Read from the country config so this panel cannot fall behind the countries
// the app actually serves — it is the first thing a visitor sees.
const countryNames = COUNTRY_OPTIONS.map((code) => COUNTRY_CONFIG[code].label);
const currencies = COUNTRY_OPTIONS.map((code) => COUNTRY_CONFIG[code].currency);

/**
 * Every claim here is a feature that ships today: multi-stop and alternatives
 * from the route service, scheduling from the trip form, cameras from
 * /live-cams, alerts from the saved-trip evaluator, and fares from the
 * per-country rate cards. Nothing aspirational — someone who signs up should
 * not find the panel promised something the app cannot do.
 */
const highlights = [
  {
    icon: <MapPinned className="size-4" />,
    label: "Multi-stop trips",
    body: "Up to 6 stops, reordered freely",
  },
  {
    icon: <Route className="size-4" />,
    label: "Ranked alternatives",
    body: "The top 3 routes, compared",
  },
  {
    icon: <CalendarClock className="size-4" />,
    label: "Scheduled departures",
    body: "Plan up to 7 days ahead",
  },
  {
    icon: <TrafficCone className="size-4" />,
    label: "Live traffic",
    body: "Congestion levels and city cameras",
  },
  {
    icon: <BellRing className="size-4" />,
    label: "Trip alerts",
    body: "Watch weather, traffic and fare changes",
  },
  {
    icon: <Wallet className="size-4" />,
    label: "Fare estimates",
    body: `Priced in ${currencies.slice(0, -1).join(", ")} or ${currencies[currencies.length - 1]}`,
  },
];

// Auth lives outside the main shell so these pages render full-bleed with no
// navbar — a "Sign Up" button in the header while you are on the signup page is
// just noise competing with the form.
//
// This panel is the app's front door: there is no separate landing page, so
// /signin is where visitors arrive and this is the only pitch they get.
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
          <span className="text-lg font-semibold text-foreground">NoboJatra</span>
        </div>

        <div className="relative max-w-xl">
          <p className="text-sm font-medium text-primary">
            {countryNames.join(" · ")}
          </p>
          <h2 className="mt-3 text-4xl font-bold tracking-tight text-balance text-foreground">
            Plan smarter routes, wherever you are going
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Compare real alternatives, watch traffic and weather as they change,
            and know the fare before you leave.
          </p>

          <ul className="mt-10 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {highlights.map((highlight) => (
              <li key={highlight.label} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                  {highlight.icon}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {highlight.label}
                  </p>
                  <p className="text-sm text-muted-foreground">{highlight.body}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-sm text-muted-foreground">
            Plus trip history, saved places, and photo search for Dhaka
            landmarks.
          </p>
        </div>

        <p className="relative text-xs text-muted-foreground">
          © {new Date().getFullYear()} NoboJatra
        </p>
      </aside>

      <div className="flex flex-col">
        <header className="flex items-center justify-between px-6 py-6 sm:px-10">
          <BackToSignIn />
          <span className="text-sm font-semibold text-foreground lg:hidden">
            NoboJatra
          </span>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 pb-16 sm:px-10">
          <div className="w-full max-w-sm">
            <div className="mb-10 lg:hidden">
              <p className="text-xs font-medium text-primary">
                {countryNames.join(" · ")}
              </p>
              {/* A <p>, not a heading: the form below owns the page's h1. */}
              <p className="mt-2 text-2xl font-bold tracking-tight text-balance text-foreground">
                Plan smarter routes, wherever you are going
              </p>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {highlights.map((highlight) => (
                  <li
                    key={highlight.label}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    {highlight.label}
                  </li>
                ))}
              </ul>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
