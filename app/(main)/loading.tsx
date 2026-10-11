/**
 * Shown while a page under the main layout waits on its session and data.
 *
 * Every page here is rendered on the server after several reads. Without this
 * a click on a link shows the previous page, unchanged, until the next one is
 * ready — which reads as the click not having registered.
 */
export default function Loading() {
  return (
    <main className="flex-1" aria-busy="true">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="sr-only" role="status">
          Loading…
        </p>
        <div className="animate-pulse space-y-6" aria-hidden>
          <div className="space-y-3">
            <div className="h-9 w-56 rounded-lg bg-muted" />
            <div className="h-4 w-80 max-w-full rounded bg-muted" />
          </div>
          <div className="h-28 rounded-2xl border border-border bg-card" />
          <div className="h-28 rounded-2xl border border-border bg-card" />
          <div className="h-28 rounded-2xl border border-border bg-card" />
        </div>
      </div>
    </main>
  );
}
