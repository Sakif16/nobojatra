import Link from "next/link";
import { buttonVariants } from "./ui/button";
import PrimaryNav from "./PrimaryNav";
import ProfileMenu from "./ProfileMenu";
import NotificationBell from "./notifications/NotificationBell";
import { getRequestSession } from "@/lib/request-context";
import { Route } from "lucide-react";

function Wordmark() {
  return <Link href="/" aria-label="NoboJatra home" className="inline-flex shrink-0 items-center gap-2 font-semibold text-foreground"><span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary"><Route className="size-5" aria-hidden /></span><span className="hidden sm:inline">NoboJatra</span></Link>;
}

export default async function Navbar() {
  const session = await getRequestSession();

  if (!session) {
    return (
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[var(--app-header-height)] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Wordmark />
          <div className="flex items-center gap-3">
            {/* buttonVariants on the Link itself: an <a> inside a <button> is
                invalid nesting, and it leaves the padding outside the hit area. */}
            <Link
              href="/signin"
              className={buttonVariants({ variant: "outline_primary", size: "md" })}
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className={buttonVariants({ size: "md" })}
            >
              Sign Up
            </Link>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[var(--app-header-height)] max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:gap-6 lg:px-8">
        <Wordmark />

        <PrimaryNav className="min-w-0 flex-1" />

        <div className="flex min-w-0 items-center gap-3">
          {/* Server component rendering a client child — the bell owns its own
              polling, so the navbar stays static. */}
          <NotificationBell />

          <ProfileMenu userName={session.user.name} />
        </div>
      </div>
    </header>
  );
}
