"use client";

import { useEffect, useState } from "react";
import Pill from "@/components/ui/pill";

function countdown(scheduledAt: string, now: number) {
  const minutes = Math.ceil((new Date(scheduledAt).getTime() - now) / 60_000);
  if (!Number.isFinite(minutes)) return "Departure time unavailable";
  if (minutes <= 0) return "Departure time reached";
  if (minutes < 60) return `In ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `In ${hours}h ${minutes % 60}m`;
  return `In ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export default function DepartureCountdown({ scheduledAt }: { scheduledAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);
  return <Pill>{now === null ? "Calculating departure…" : countdown(scheduledAt, now)}</Pill>;
}
