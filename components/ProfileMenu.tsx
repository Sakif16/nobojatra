"use client";

import { Popover } from "@base-ui/react/popover";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import Logout from "./logout";

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
      <Popover.Trigger className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        {userName}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8}>
          <Popover.Popup className="z-50 w-40 origin-top-right overflow-hidden rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg outline-none transition-[opacity,transform] duration-200 ease-out data-[ending-style]:translate-y-1 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-1 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {/* Closed by hand: a client-side navigation does not unmount the
                navbar, so the menu would otherwise still be open on arrival. */}
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              Profile
            </Link>
            <div className="mt-1">
              <Logout />
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
