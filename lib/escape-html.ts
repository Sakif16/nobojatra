/**
 * Makes a value safe to place inside an HTML string.
 *
 * Almost nothing here builds HTML by hand — React escapes what it renders. The
 * exception is Leaflet, whose `divIcon` and popups take a raw HTML string, so
 * anything interpolated into one goes through this first. Place names come
 * from a search service and from what users type; neither is trusted markup.
 */
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"'`]/g, (character) => HTML_ESCAPES[character]);
}
