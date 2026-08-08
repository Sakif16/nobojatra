import Link from "next/link";
import { CalendarClock, MapPinned, Route } from "lucide-react";
import MapDashboardSection from "@/components/map/MapDashboardSection";
import { buttonVariants } from "@/components/ui/button";

const features = [
  {
    icon: <MapPinned className="size-5" />,
    title: "Multi-stop planning",
    body: "Add up to six stops, reorder them freely, and see every leg drawn in its own colour.",
  },
  {
    icon: <Route className="size-5" />,
    title: "Real alternatives",
    body: "Up to three ranked routes with distance and time, de-duplicated so you never compare the same road twice.",
  },
  {
    icon: <CalendarClock className="size-5" />,
    title: "Leave now or later",
    body: "Plan for right now, or schedule a departure up to seven days ahead.",
  },
];

// Fare comparison shipped — it lives on /fares now, so it is no longer "on the way".
const upcoming = [
  "Live congestion levels",
  "Peak-hour insights",
  "Saved places",
];

export default function AnonymousHome() {
  return (
    <main className="flex-1">
      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <p className="text-sm font-medium text-primary">Dhaka, Bangladesh</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
          Plan smarter routes across Dhaka
        </h1>
        <p className="mt-3 max-w-xl text-lg text-muted-foreground">
          নতুন যাত্রা শুরু হোক — compare routes, chain your stops, and leave on
          your own schedule.
        </p>

        <div className="mt-10">
          <MapDashboardSection
            variant="anonymous"
            aside={
              <div className="rounded-3xl border border-border bg-card p-6 lg:p-8">
                <h2 className="text-lg font-semibold text-foreground">
                  Start with a free account
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Search any place in Dhaka right now. Enter your trip above and
                  we&apos;ll pick it straight back up once you sign up — nothing
                  you type gets lost.
                </p>
                <ul className="mt-6 space-y-3">
                  {features.map((feature) => (
                    <li key={feature.title} className="flex gap-3">
                      <span className="mt-0.5 text-primary">{feature.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {feature.title}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {feature.body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/signup"
                    className={buttonVariants({ size: "md" })}
                  >
                    Create account
                  </Link>
                  <Link
                    href="/signin"
                    className={buttonVariants({ variant: "outline", size: "md" })}
                  >
                    Sign in
                  </Link>
                </div>
              </div>
            }
          />
        </div>
      </section>

      <section className="border-t border-border bg-card/40">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            On the way
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {upcoming.map((item) => (
              <li
                key={item}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
          Ready to start your journey?
        </h2>
        <p className="mt-2 text-muted-foreground">
          Free to use, and it takes under a minute.
        </p>
        <Link
          href="/signup"
          className={buttonVariants({ size: "md", className: "mt-6 px-6" })}
        >
          Create your account
        </Link>
      </section>
    </main>
  );
}
