/**
 * The app's destinations, shown on every signed-in page by
 * components/PrimaryNav.
 */
export const PRIMARY_LINKS = [
  { href: "/", label: "Planner" },
  { href: "/scheduled-trips", label: "Scheduled" },
  { href: "/saved-trips", label: "Saved trips" },
  { href: "/trip-history", label: "History" },
  { href: "/live-cams", label: "Live traffic" },
] as const;

/** The planner owns "/" alone; every other link owns its path and what is under it. */
export function isCurrentPath(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
