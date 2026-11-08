"use client";

import { ArrowRight, Maximize2 } from "lucide-react";
import type { RouteResult, TripTrafficResult } from "@/lib/routing";
import { buttonVariants } from "@/components/ui/button";
import Chip from "@/components/ui/chip";
import Panel from "@/components/ui/panel";
import Pill from "@/components/ui/pill";

type Props = {
  route: RouteResult;
  origin: string;
  destination: string;
  passengers: number;
  traffic: TripTrafficResult | null;
  trafficLoading: boolean;
  trafficError?: string | null;
  departure: string | null;
  accessNote?: string;
  canViewFares: boolean;
  onViewFares: () => void;
  onFitRoute: () => void;
};

export default function RouteDetailCard({ route, origin, destination, passengers, traffic, trafficLoading, trafficError, departure, accessNote, canViewFares, onViewFares, onFitRoute }: Props) {
  const trafficLabel = trafficLoading ? "Checking traffic…" : traffic ? `${traffic.totals.congestionLevel} traffic` : trafficError ? "Traffic unavailable" : "No live traffic";
  const facts = [`${route.distanceKm} km`, `${route.durationMin} min`, trafficLabel, `${passengers} ${passengers === 1 ? "passenger" : "passengers"}`];

  return (
    <section aria-label="Selected route details" className="planner-fade-up" style={{ animationDelay: "1100ms" }}>
      <Panel className="bg-card/95 shadow-lg backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">Route {route.rank}</h2>
        <Pill className="font-normal">{route.rank === 1 ? "Suggested" : "Alternative"}</Pill>
      </div>
      <p className="mt-1 truncate text-sm text-muted-foreground" title={`${origin} → ${destination}`}>{origin.split(",")[0]} → {destination.split(",")[0]}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {facts.map((fact) => <Chip label key={fact} className="min-h-0 border-border bg-background/50 px-2.5 py-1 font-normal">{fact}</Chip>)}
      </div>
      {departure && <p className="mt-3 text-xs text-muted-foreground">Departing {departure}</p>}
      {accessNote && <p className="mt-2 text-xs text-muted-foreground">{accessNote}</p>}
      <button type="button" onClick={onViewFares} disabled={!canViewFares} className={buttonVariants({ size: "form", className: "mt-4 w-full" })}>
        View fare estimates <ArrowRight size={16} aria-hidden="true" />
      </button>
      {!canViewFares && <p className="mt-2 text-xs text-muted-foreground">Fare estimates require a saved trip.</p>}
      <button type="button" onClick={onFitRoute} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted">
        <Maximize2 size={15} aria-hidden="true" /> Fit route
      </button>
      </Panel>
    </section>
  );
}
