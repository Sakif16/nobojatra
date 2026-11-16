import Link from "next/link";

/**
 * The footer states only what is known. It used to carry a postal address and
 * a support email that nobody had supplied — placeholders, in the one place
 * where an invented detail is read as fact. They are gone until there are real
 * ones to put here.
 */
const COMPANY = {
  legalName: "NoboJatra",
  /* No LICENSE file exists in this repo, so the footer claims no more than the
     default: rights reserved. Swap this line if the project is ever licensed. */
  licence: "All rights reserved.",
};

const productLinks = [
  { href: "/", label: "Plan a route" },
  { href: "/scheduled-trips", label: "Scheduled trips" },
  { href: "/saved-trips", label: "Saved trips" },
  { href: "/trip-history", label: "Trip history" },
  { href: "/live-cams", label: "Live cams" },
  { href: "/profile", label: "Profile" },
];

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-card/40">
      {/* Full width like the navbar, so both line up with the map sidebar. */}
      <div className="w-full px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-semibold text-foreground">NoboJatra</p>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {productLinks.map((link) => <li key={link.href}><Link href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{link.label}</Link></li>)}
          </ul>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} {COMPANY.legalName}. {COMPANY.licence}</p>
          <p>Fares and travel times are estimates, not quotes.</p>
        </div>
      </div>
    </footer>
  );
}
