import type { Metadata } from "next";
import LiveCamsFrame from "@/components/live-cams/LiveCamsFrame";
import PageHeader from "@/components/ui/page-header";
import PageContainer from "@/components/ui/page-container";
import Panel from "@/components/ui/panel";

export const metadata: Metadata = { title: "Live cams" };

export default function LiveCamsPage() {
  return (
    <PageContainer>
        <div className="mb-6 max-w-3xl">
          <PageHeader title="Live cams" back={{ href: "/", label: "Back to planner" }} subtitle="Community-streamed live views of roads and junctions, contributed by other users." />
        </div>

        <Panel padding="sm"><p className="px-2 pb-3 text-sm text-muted-foreground">Community-streamed</p><LiveCamsFrame /></Panel>
      </PageContainer>
  );
}
