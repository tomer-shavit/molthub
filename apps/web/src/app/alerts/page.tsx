export const dynamic = "force-dynamic";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, type AlertSummary, type HealthAlert } from "@/lib/api";
import { AlertTriangle, Bell, CheckCircle, ShieldAlert } from "lucide-react";
import { AlertsList } from "./alerts-list";

// ---------------------------------------------------------------------------
// Server-side data fetching
// ---------------------------------------------------------------------------

async function getAlertSummary(): Promise<AlertSummary | null> {
  try {
    return await api.getAlertSummary();
  } catch (error) {
    console.error("Failed to fetch alert summary:", error);
    return null;
  }
}

async function getAlerts(
  searchParams: Record<string, string | undefined>,
): Promise<{ data: HealthAlert[]; total: number }> {
  try {
    const result = await api.listAlerts({
      instanceId: searchParams.instanceId,
      fleetId: searchParams.fleetId,
      severity: searchParams.severity as any,
      status: searchParams.status as any,
      rule: searchParams.rule,
      page: searchParams.page ? parseInt(searchParams.page, 10) : undefined,
      limit: 25,
    });
    return { data: result.data, total: result.total };
  } catch (error) {
    console.error("Failed to fetch alerts:", error);
    return { data: [], total: 0 };
  }
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------

function SummaryCards({ summary }: { summary: AlertSummary | null }) {
  const active = summary?.byStatus["ACTIVE"] ?? 0;
  const acknowledged = summary?.byStatus["ACKNOWLEDGED"] ?? 0;
  const resolved = summary?.byStatus["RESOLVED"] ?? 0;
  const total = summary?.total ?? 0;

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Active</CardTitle>
          <ShieldAlert className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">{active}</div>
          <p className="text-xs text-muted-foreground">Requires attention</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Acknowledged</CardTitle>
          <Bell className="h-4 w-4 text-yellow-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-yellow-600">
            {acknowledged}
          </div>
          <p className="text-xs text-muted-foreground">Being investigated</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Resolved</CardTitle>
          <CheckCircle className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{resolved}</div>
          <p className="text-xs text-muted-foreground">Recently resolved</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Open</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{total}</div>
          <p className="text-xs text-muted-foreground">
            Non-resolved alerts
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const [summary, alertsResult] = await Promise.all([
    getAlertSummary(),
    getAlerts(searchParams),
  ]);

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Health Alerts</h1>
          <p className="text-muted-foreground mt-1">
            Monitor, acknowledge, and remediate alerts across your Moltbot fleet
          </p>
        </div>
        {summary && (
          <div className="flex items-center gap-2">
            {(summary.bySeverity["CRITICAL"] ?? 0) > 0 && (
              <Badge variant="destructive">
                {summary.bySeverity["CRITICAL"]} Critical
              </Badge>
            )}
            {(summary.bySeverity["ERROR"] ?? 0) > 0 && (
              <Badge variant="warning">
                {summary.bySeverity["ERROR"]} Errors
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <SummaryCards summary={summary} />

      {/* Alert List (client component for interactivity) */}
      <AlertsList
        initialAlerts={alertsResult.data}
        initialTotal={alertsResult.total}
        filters={{
          severity: searchParams.severity,
          status: searchParams.status,
          instanceId: searchParams.instanceId,
        }}
      />
    </DashboardLayout>
  );
}
