import {
  BookmarkCheck,
  CalendarClock,
  History,
  MapPinned,
  Route,
  Wallet,
} from "lucide-react";

type Feature = {
  label: string;
  description: string;
  icon: React.ReactNode;
};

const features: Feature[] = [
  {
    label: "Multi-stop routing",
    description: "Build trips with up to 6 planned stops",
    icon: <MapPinned className="size-6" />,
  },
  {
    label: "Scheduled trips",
    description: "Plan departures up to 7 days ahead",
    icon: <CalendarClock className="size-6" />,
  },
  {
    label: "AI route ranking",
    description: "Compare the top 3 route options",
    icon: <Route className="size-6" />,
  },
  {
    label: "Trip history",
    description: "Review confirmed trips and recent searches",
    icon: <History className="size-6" />,
  },
  {
    label: "Saved trips & alerts",
    description: "Track weather, traffic, and fare changes",
    icon: <BookmarkCheck className="size-6" />,
  },
  {
    // Live now, but /fares needs a route's distance and duration, so this stays
    // a descriptive tile rather than a link that would bounce straight back.
    label: "Fare comparison",
    description: "Estimate Uber, Pathao, and CNG fares",
    icon: <Wallet className="size-6" />,
  },
];

function TileBody({ feature }: { feature: Feature }) {
  return (
    <>
      <span className="text-primary">{feature.icon}</span>
      <span className="mt-3 flex items-center gap-2 text-sm font-medium text-foreground">
        {feature.label}
      </span>
      <span className="mt-1 text-xs text-muted-foreground">
        {feature.description}
      </span>
    </>
  );
}

export default function SuggestionTiles() {
  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">NoboJatra features</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Built-in tools for smarter route planning in Dhaka.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {features.map((feature) => (
          <div
            key={feature.label}
            className="flex cursor-default flex-col rounded-lg border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 hover:border-primary/45 hover:shadow-[0_0_24px_rgba(249,151,57,0.18)]"
          >
            <TileBody feature={feature} />
          </div>
        ))}
      </div>
    </div>
  );
}
