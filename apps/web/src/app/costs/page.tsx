export const dynamic = "force-dynamic";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  api,
  type BudgetConfig,
  type PaginatedCostEvents,
} from "@/lib/api";
import { BudgetGaugeList } from "@/components/costs/budget-gauge";
import { CostEventsTable } from "./cost-events-table";

async function getBudgets(): Promise<BudgetConfig[]> {
  try {
    return await api.listBudgets({ isActive: true });
  } catch {
    return [];
  }
}

async function getRecentEvents(): Promise<PaginatedCostEvents | null> {
  try {
    return await api.listCostEvents({ limit: 20 });
  } catch {
    return null;
  }
}

export default async function CostsPage() {
  const [budgets, recentEvents] = await Promise.all([
    getBudgets(),
    getRecentEvents(),
  ]);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Cost Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Track spending, manage budgets, and monitor cost events
          </p>
        </div>
      </div>

      {/* Budget Gauges */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Budget Status</h2>
        <BudgetGaugeList budgets={budgets} />
      </div>

      {/* Recent Cost Events */}
      {recentEvents && recentEvents.data.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Recent Cost Events</h2>
          <CostEventsTable events={recentEvents.data} />
        </div>
      )}
    </DashboardLayout>
  );
}
