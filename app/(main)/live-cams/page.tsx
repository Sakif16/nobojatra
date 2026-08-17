import LiveCamsFrame from "@/components/live-cams/LiveCamsFrame";

export default function LiveCamsPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Live Cams
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Community-streamed live views of roads and junctions, contributed by other users.
          </p>
        </div>

        <LiveCamsFrame />
      </div>
    </main>
  );
}