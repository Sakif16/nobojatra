import type { Metadata } from "next";
import LiveCamsFrame from "@/components/live-cams/LiveCamsFrame";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";

export const metadata: Metadata = { title: "Live cams" };

export default function LiveCamsPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 max-w-3xl">
          <PageHeader title="Live cams" back={{ href: "/", label: "Back to planner" }} subtitle="Community-streamed live views of roads and junctions, contributed by other users." />
        </div>

        <Panel padding="sm"><p className="px-2 pb-3 text-sm text-muted-foreground">Community-streamed</p><LiveCamsFrame /></Panel>
      </div>
    </main>
  );
}
