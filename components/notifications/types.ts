/**
 * The wire shape of an alert, re-exported from the server module that defines
 * it so the two cannot drift.
 *
 * `export type` is erased at compile time, so this never pulls lib/alerts.ts —
 * which is "server-only" — into a client bundle. If that ever needs to change,
 * replace the re-export with a local copy of the shape rather than making this
 * a value import.
 */
export type { AlertView, AlertSeverity } from "@/lib/alerts";
