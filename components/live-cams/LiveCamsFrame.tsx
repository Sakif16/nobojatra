"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

const TRAFFIC_PUNK_URL = "https://traffic-punk-re.onrender.com/";

/**
 * Embeds the Traffic Punk landing page directly — it already lists every
 * currently-live stream by place/district/country, so no API integration is
 * needed on our side at all. This is the entire feature.
 */
export default function LiveCamsFrame() {
  const [loaded, setLoaded] = useState(false);
  // Bumping this remounts the iframe, giving the user a manual retry if the
  // free-tier host was asleep and the first load timed out or came back blank.
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="relative h-[75vh] w-full overflow-hidden rounded-3xl border border-border bg-card">
      {!loaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-card text-center">
          <RefreshCw className="size-5 animate-spin text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Loading live cams…</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            The camera feed service can take up to a minute to wake up on first load.
          </p>
        </div>
      )}

      <iframe
        key={reloadKey}
        src={TRAFFIC_PUNK_URL}
        onLoad={() => setLoaded(true)}
        className="h-full w-full"
        title="Live traffic camera feeds"
        allow="camera; autoplay; encrypted-media"
      />

      <div className="absolute top-3 right-3 z-10 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setLoaded(false);
            setReloadKey((k) => k + 1);
          }}
          className="flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted"
        >
          <RefreshCw className="size-3" />
          Reload
        </button>
        <a
          href={TRAFFIC_PUNK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted"
        >
          <ExternalLink className="size-3" />
          Open in new tab
        </a>
      </div>
    </div>
  );
}