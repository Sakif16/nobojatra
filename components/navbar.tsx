import Link from "next/link";
import { buttonVariants } from "./ui/button";
import ProfileMenu from "./ProfileMenu";
import NotificationBell from "./notifications/NotificationBell";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export default async function Navbar() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return (
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="font-semibold text-foreground">
            NoboJatra
          </Link>
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
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="font-semibold text-foreground">
          NoboJatra
        </Link>

        <div className="flex items-center gap-3">
          {/* Server component rendering a client child — the bell owns its own
              polling, so the navbar stays static. */}
          <NotificationBell />

          <ProfileMenu userName={session.user.name} />
        </div>
      </div>
    </header>
  );
}
