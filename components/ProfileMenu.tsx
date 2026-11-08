"use client";

import { Popover } from "@base-ui/react/popover";
import { UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import Logout from "./logout";
import Panel from "@/components/ui/panel";

/**
 * The account menu in the navbar.
 *
 * Built on the same Base UI Popover as ../notifications/NotificationBell
 * rather than the <details>/<summary> pair this replaced: native details has
 * no notion of "outside", so the menu stayed open until its own summary was
 * clicked again. The popover brings dismiss-on-outside-click, Escape, focus
 * management and the portal, and matches the bell it sits beside.
 */
export default function ProfileMenu({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {/* max-w + truncate: a long display name would otherwise push the bell
          and the wordmark apart until the navbar overflowed a phone. */}
      <Popover.Trigger aria-label={`Account menu for ${userName}`} className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-background text-foreground transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <UserRound className="size-4" aria-hidden />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8}>
          <Popover.Popup className="z-50 w-56 origin-top-right shadow-lg outline-none transition-[opacity,transform] duration-200 ease-out data-[ending-style]:translate-y-1 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-1 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {/* Closed by hand: a client-side navigation does not unmount the
                navbar, so the menu would otherwise still be open on arrival. */}
            <Panel padding="sm" className="bg-popover text-popover-foreground"><p className="truncate px-3 py-1 text-xs text-muted-foreground">{userName}</p>
            <Link href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-foreground hover:bg-muted"><span className="flex size-9 items-center justify-center rounded-full bg-secondary"><UserRound className="size-4" aria-hidden /></span>Profile</Link>
            <div className="mt-1">
              <Logout />
            </div>
            </Panel>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
