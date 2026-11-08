/** Decorative map artwork; no external map tiles or location data are used. */
export default function RouteArtwork({ className }: { className?: string }) {
  const route = "M65 365 L112 334 L118 272 L185 252 L218 195 L295 184 L332 120 L387 77";
  return (
    <svg viewBox="0 0 440 440" fill="none" aria-hidden="true" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect width="440" height="440" fill="var(--card)" />
      <g stroke="var(--muted-foreground)" strokeWidth="1.2" opacity="0.2">
        <path d="M-20 55 L460 200 M-10 120 L450 265 M-20 186 L440 330 M-20 252 L440 397 M-20 319 L330 440 M20 0 L-20 120 M95 0 L-20 360 M170 0 L30 440 M245 0 L105 440 M320 0 L180 440 M395 0 L255 440 M465 0 L330 440" />
        <path d="M0 29 L440 163 M0 91 L440 226 M0 156 L440 292 M0 221 L440 357 M0 286 L440 422 M55 0 L0 170 M132 0 L0 408 M208 0 L68 440 M283 0 L143 440 M358 0 L218 440" strokeWidth=".55" />
      </g>
      <path d={route} pathLength="1" className="planner-route planner-route-glow" stroke="var(--primary)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" opacity=".65" style={{ "--planner-duration": "2s" } as React.CSSProperties} />
      <path d={route} pathLength="1" className="planner-route" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ "--planner-duration": "2s" } as React.CSSProperties} />
      {[[65,365], [218,195], [387,77]].map(([x,y], index) => <g key={x} transform={`translate(${x} ${y})`}><g className="auth-art-pin" style={{ "--planner-delay": `${index * 650 + 150}ms` } as React.CSSProperties}><circle r="10" fill="var(--card)" stroke="var(--primary)" strokeWidth="3" /><circle r="3" fill="var(--primary)" /></g></g>)}
    </svg>
  );
}
