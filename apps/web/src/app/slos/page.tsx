export const dynamic = "force-dynamic";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { api } from "@/lib/api";
import { SlosDashboardClient } from "./slos-dashboard-client";

async function getSlosData() {
  try {
    const [slos, summary] = await Promise.all([
      api.listSlos(),
      api.getSloSummary(),
    ]);
    return { slos, summary };
  } catch {
    return {
      slos: [],
      summary: { total: 0, breached: 0, healthy: 0, compliancePercent: 100 },
    };
  }
}

export default async function SlosPage() {
  const { slos, summary } = await getSlosData();

  return (
    <DashboardLayout>
      <SlosDashboardClient initialSlos={slos} initialSummary={summary} />
    </DashboardLayout>
  );
}
