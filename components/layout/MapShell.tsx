import type { ReactNode } from "react";

type Props = {
  sidebar: ReactNode;
  map: ReactNode;
  overlay?: ReactNode;
  idleOverlay?: ReactNode;
};

/**
 * The room the floating card takes in the map's bottom-right corner on wide
 * screens: its 320px width plus the 16px right offset, and roughly its
 * height plus the 40px bottom offset. Passed to RouteMap so a fitted route
 * stays clear of the card.
 */
export const MAP_OVERLAY_RESERVE = { width: 336, height: 320 };

/** Shared responsive layout for map-led pages. The caller owns its content. */
export default function MapShell({ sidebar, map, overlay, idleOverlay }: Props) {
  return (
    <div className="flex w-full flex-col lg:h-[calc(100dvh-var(--app-header-height))] lg:flex-row">
      <div className="flex min-w-0 flex-col gap-4 bg-card px-4 py-6 sm:px-6 lg:w-[400px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-border">
        {sidebar}
      </div>
      <div className="relative min-w-0 px-4 lg:h-full lg:flex-1 lg:px-0">
        <div className="h-[55vh] min-h-[300px] w-full overflow-hidden rounded-2xl lg:h-full lg:rounded-none">
          {map}
        </div>
        {idleOverlay && (
          <div className="mt-4 lg:pointer-events-none lg:absolute lg:inset-0 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:p-8">
            <div className="w-full lg:pointer-events-auto lg:max-w-[640px]">{idleOverlay}</div>
          </div>
        )}
        {overlay && (
          <div className="mt-4 lg:absolute lg:right-4 lg:bottom-10 lg:z-1000 lg:mt-0 lg:w-[320px] lg:max-w-[calc(100%-2rem)]">
            {overlay}
          </div>
        )}
      </div>
    </div>
  );
}
