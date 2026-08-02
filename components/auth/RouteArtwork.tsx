import { INACTIVE_ROUTE_COLOR, ROUTE_COLORS } from "@/lib/routing";

/**
 * Decorative route motif for the auth brand panel. Deliberately speaks the
 * product's own visual language: a hollow circle for origin and a filled square
 * for destination, matching the trip form's inputs and the map's waypoints,
 * drawn in the same amber that marks the best route.
 */
export default function RouteArtwork({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 420"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Faint street grid */}
      <g stroke="currentColor" strokeWidth="1" opacity="0.08">
        {[60, 130, 200, 270, 340].map((offset) => (
          <line key={`v-${offset}`} x1={offset} y1="0" x2={offset} y2="420" />
        ))}
        {[60, 130, 200, 270, 340].map((offset) => (
          <line key={`h-${offset}`} x1="0" y1={offset} x2="420" y2={offset} />
        ))}
      </g>

      {/* A discarded alternative, faded back the way the map renders them */}
      <path
        d="M62 348 C 150 330, 150 250, 240 236 S 330 150, 356 66"
        stroke={INACTIVE_ROUTE_COLOR}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="2 10"
        opacity="0.45"
      />

      {/* The chosen route */}
      <path
        d="M62 348 C 130 348, 116 244, 196 214 S 306 176, 356 66"
        stroke={ROUTE_COLORS[0]}
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Waypoint */}
      <circle
        cx="196"
        cy="214"
        r="7"
        fill={ROUTE_COLORS[1]}
        stroke="currentColor"
        strokeWidth="3"
      />

      {/* Origin — hollow circle */}
      <circle
        cx="62"
        cy="348"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />

      {/* Destination — filled square */}
      <rect x="347" y="57" width="18" height="18" rx="2" fill="currentColor" />
    </svg>
  );
}
