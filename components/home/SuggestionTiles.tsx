import {
  CalendarClock,
  History,
  MapPinned,
  Route,
  Star,
  Wallet,
} from "lucide-react";
import Link from "next/link";

type Suggestion = {
  label: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
  soon?: boolean;
};

// Only the first three map to something that actually works today. The rest are
// modelled in the database but have no UI yet, so they carry a "Soon" badge
// rather than pretending to be live.
const suggestions: Suggestion[] = [
  {
    label: "Multi-stop",
    description: "Chain up to 6 stops in one trip",
    icon: <MapPinned className="size-6" />,
  },
  {
    label: "Schedule",
    description: "Plan a departure up to 7 days out",
    icon: <CalendarClock className="size-6" />,
  },
  {
    label: "Compare routes",
    description: "Up to 3 ranked alternatives",
    icon: <Route className="size-6" />,
  },
  {
    label: "Trip history",
    description: "Revisit your recent journeys",
    icon: <History className="size-6" />,
    href: "#recent-trips",
  },
  {
    label: "Saved places",
    description: "Home, work and favourites",
    icon: <Star className="size-6" />,
    soon: true,
  },
  {
    label: "Fare compare",
    description: "Uber, Pathao and CNG estimates",
    icon: <Wallet className="size-6" />,
    soon: true,
  },
];

function TileBody({ suggestion }: { suggestion: Suggestion }) {
  return (
    <>
      <span className="text-primary">{suggestion.icon}</span>
      <span className="mt-3 flex items-center gap-2 text-sm font-medium text-foreground">
        {suggestion.label}
        {suggestion.soon ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Soon
          </span>
        ) : null}
      </span>
      <span className="mt-1 text-xs text-muted-foreground">
        {suggestion.description}
      </span>
    </>
  );
}

export default function SuggestionTiles() {
  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Suggestions</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {suggestions.map((suggestion) =>
          suggestion.href ? (
            <Link
              key={suggestion.label}
              href={suggestion.href}
              className="flex flex-col rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted"
            >
              <TileBody suggestion={suggestion} />
            </Link>
          ) : (
            <div
              key={suggestion.label}
              className="flex flex-col rounded-2xl border border-border bg-card p-4"
            >
              <TileBody suggestion={suggestion} />
            </div>
          )
        )}
      </div>
    </div>
  );
}
