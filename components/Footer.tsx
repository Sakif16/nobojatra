import Link from "next/link";
import { Mail, MapPin } from "lucide-react";
import { COUNTRY_CONFIG, COUNTRY_OPTIONS } from "@/lib/country-config";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * REPLACE THESE WITH THE REAL DETAILS BEFORE LAUNCH.
 *
 * They are placeholders, not researched facts — nobody has told this repo the
 * registered company name, address or support inbox, and a footer is exactly
 * the place where an invented one would be mistaken for the truth.
 * ─────────────────────────────────────────────────────────────────────────
 */
const COMPANY = {
  legalName: "NoboJatra",
  addressLines: ["Dhaka, Bangladesh"],
  email: "contact@nobojatra.app",
  /* No LICENSE file exists in this repo, so the footer claims no more than the
     default: rights reserved. Swap this line if the project is ever licensed. */
  licence: "All rights reserved.",
};

const serviceAreas = COUNTRY_OPTIONS.map(
  (code) => COUNTRY_CONFIG[code].serviceAreaName,
);

const productLinks = [
  { href: "/", label: "Plan a route" },
  { href: "/saved-trips", label: "Saved trips" },
  { href: "/trip-history", label: "Trip history" },
  { href: "/live-cams", label: "Live traffic" },
  { href: "/profile", label: "Profile" },
];

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-card/40">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="font-semibold text-foreground">NoboJatra</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Compare routes, chain your stops and price the trip before you
              leave — across {serviceAreas.slice(0, -1).join(", ")} and{" "}
              {serviceAreas[serviceAreas.length - 1]}.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground">Product</p>
            <ul className="mt-3 space-y-2">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground">Contact</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 flex-shrink-0" aria-hidden />
                <span>
                  {COMPANY.addressLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 size-4 flex-shrink-0" aria-hidden />
                <a
                  href={`mailto:${COMPANY.email}`}
                  className="transition-colors hover:text-foreground"
                >
                  {COMPANY.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-6 text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} {COMPANY.legalName}. {COMPANY.licence}
          </p>
          <p>Fares and travel times are estimates, not quotes.</p>
        </div>
      </div>
    </footer>
  );
}
