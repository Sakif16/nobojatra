"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

import { LIVE_CAMS_URL } from "@/lib/live-cams";

/**
 * Embeds the Traffic Punk landing page directly — it already lists every
 * currently-live stream by place/district/country, so no API integration is
 * needed on our side at all. This is the entire feature.
 */
function reportCameraFailure(event: "camera_timeout" | "camera_load_error") {
  void fetch("/api/diagnostics", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
  }).catch(() => {});
}

export default function LiveCamsFrame() {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Bumping this remounts the iframe, giving the user a manual retry if the
  // free-tier host was asleep and the first load timed out or came back blank.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (loaded) return;
    const timeout = setTimeout(() => { setFailed(true); reportCameraFailure("camera_timeout"); }, 60_000);
    return () => clearTimeout(timeout);
  }, [loaded, reloadKey]);

  return (
    <div className="relative min-h-[500px] w-full overflow-hidden rounded-3xl border border-border bg-card">
      {!loaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-card text-center">
          {!failed && <RefreshCw className="size-5 animate-spin text-muted-foreground" />}
          <p role="status" className="text-sm font-medium text-foreground">
            {failed ? "The external camera page did not finish loading." : "Loading external camera page…"}
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {failed ? "Try Reload or open the external site using the controls above." : "This third-party service can take up to a minute to wake up."}
          </p>
        </div>
      )}

      <p className="px-4 py-3 text-sm text-muted-foreground">
        External feeds provided by Traffic Punk. NoboJatra does not operate or verify the streams.
      </p>
      <iframe
        key={reloadKey}
        src={LIVE_CAMS_URL}
        onLoad={() => { setLoaded(true); setFailed(false); }}
        onError={() => { setFailed(true); reportCameraFailure("camera_load_error"); }}
        className="h-[500px] w-full"
        title="Live traffic camera feeds"
        allow="autoplay; encrypted-media"
      />

      <div className="absolute top-3 right-3 z-10 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setLoaded(false);
            setFailed(false);
            setReloadKey((k) => k + 1);
          }}
          className="flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted"
        >
          <RefreshCw className="size-3" />
          Reload
        </button>
        <a
          href={LIVE_CAMS_URL}
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