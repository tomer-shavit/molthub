export const dynamic = "force-dynamic";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  api,
  type CostSummary,
  type BudgetConfig,
  type PaginatedCostEvents,
} from "@/lib/api";
import { CostBreakdown } from "@/components/costs/cost-breakdown";
import { BudgetGaugeList } from "@/components/costs/budget-gauge";
import { DollarSign, TrendingUp, Cpu, Shield } from "lucide-react";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

async function getCostSummary(): Promise<CostSummary | null> {
  try {
    return await api.getCostSummary();
  } catch {
    return null;
  }
}

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
  const [summary, budgets, recentEvents] = await Promise.all([
    getCostSummary(),
    getBudgets(),
    getRecentEvents(),
  ]);

  const totalSpend = summary?.totalCostCents ?? 0;
  const totalEvents = summary?.totalEvents ?? 0;
  const dailyAvg = totalEvents > 0 ? Math.round(totalSpend / 30) : 0;
  const topProvider =
    summary?.byProvider && summary.byProvider.length > 0
      ? summary.byProvider[0].provider
      : "N/A";
  const activeBudgetCount = budgets.length;

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

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Spend (Month)
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCents(totalSpend)}</div>
            <p className="text-xs text-muted-foreground">
              {totalEvents} cost events
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily Average</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCents(dailyAvg)}</div>
            <p className="text-xs text-muted-foreground">
              Estimated from monthly total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Provider</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{topProvider}</div>
            <p className="text-xs text-muted-foreground">
              Highest cost provider
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Budgets
            </CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeBudgetCount}</div>
            <p className="text-xs text-muted-foreground">
              Budgets being monitored
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown by Provider & Model */}
      {summary && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Cost Breakdown</h2>
          <CostBreakdown
            byProvider={summary.byProvider}
            byModel={summary.byModel}
            totalCostCents={summary.totalCostCents}
          />
        </div>
      )}

      {/* Budget Gauges */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Budget Status</h2>
        <BudgetGaugeList budgets={budgets} />
      </div>

      {/* Recent Cost Events Table */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Cost Events</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Input Tokens</TableHead>
                  <TableHead className="text-right">Output Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Channel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!recentEvents || recentEvents.data.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground py-8"
                    >
                      No cost events recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentEvents.data.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="text-sm">
                        {formatDate(event.occurredAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{event.provider}</Badge>
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {event.model}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {event.inputTokens.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {event.outputTokens.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCents(event.costCents)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {event.channelType ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {recentEvents && recentEvents.totalPages > 1 && (
          <p className="text-sm text-muted-foreground mt-2 text-center">
            Showing page {recentEvents.page} of {recentEvents.totalPages} (
            {recentEvents.total} total events)
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}
