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

/*
 * Full width, with the same 16/24px side padding as the map sidebar, so the
 * logo sits over the sidebar's content edge instead of floating in a centred
 * 1280px column above an edge-to-edge map.
 *
 * The height is set on the header itself. Box sizing puts the bottom border
 * inside it, so the header is exactly --app-header-height tall — the number
 * the map layout subtracts. With the height on an inner row the border added
 * a pixel and the planner scrolled by one.
 */
export default async function Navbar() {
  const session = await getRequestSession();

  if (!session) {
    return (
      <header className="sticky top-0 z-40 h-(--app-header-height) border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="flex h-full w-full items-center justify-between px-4 sm:px-6">
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
    <header className="sticky top-0 z-40 h-(--app-header-height) border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="flex h-full w-full items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:gap-6">
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
