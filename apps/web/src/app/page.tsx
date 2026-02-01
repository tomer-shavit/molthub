export const dynamic = 'force-dynamic';

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, HealthIndicator } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { redirect } from "next/navigation";
import { api, type DashboardMetrics, type DashboardHealth } from "@/lib/api";
import {
  Bot,
  Activity,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

async function getDashboardData() {
  const [metrics, health, fleets, bots] = await Promise.all([
    api.getDashboardMetrics().catch(() => null),
    api.getDashboardHealth().catch(() => null),
    api.listFleets().catch(() => []),
    api.listBotInstances().catch(() => []),
  ]);
  return { metrics, health, fleets, bots };
}

export default async function DashboardPage() {
  // Redirect to onboarding wizard if no bots exist
  try {
    const onboardingStatus = await api.getOnboardingStatus();
    if (!onboardingStatus.hasInstances) {
      redirect("/setup");
    }
  } catch {
    // If onboarding check fails, continue to dashboard
  }

  const { metrics, health, fleets, bots } = await getDashboardData();

  const overallStatus = health?.status || "HEALTHY";
  const healthyPercentage = metrics && metrics.totalBots > 0
    ? Math.round((metrics.healthyBots / metrics.totalBots) * 100)
    : 0;

  return (
    <DashboardLayout>
      {/* Header with Status */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <div className={cn(
              "flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium",
              overallStatus === "HEALTHY" && "bg-green-100 text-green-800",
              overallStatus === "DEGRADED" && "bg-yellow-100 text-yellow-800",
              overallStatus === "UNHEALTHY" && "bg-red-100 text-red-800",
            )}>
              {overallStatus === "HEALTHY" ? <CheckCircle2 className="w-4 h-4" /> :
               overallStatus === "DEGRADED" ? <AlertTriangle className="w-4 h-4" /> :
               <XCircle className="w-4 h-4" />}
              {overallStatus}
            </div>
          </div>
          <p className="text-muted-foreground mt-1">
            Overview of your OpenClaw bots
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Last updated: {new Date().toLocaleTimeString()}
          </span>
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Setup Checklist */}
      <SetupChecklist />

      {/* Bot Counts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <MetricCard
          title="Total Bots"
          value={metrics?.totalBots ?? 0}
          description={`Across ${metrics?.totalFleets ?? 0} fleets`}
          icon={<Bot className="w-4 h-4" />}
        />
        <MetricCard
          title="Healthy"
          value={metrics?.healthyBots ?? 0}
          description={`${healthyPercentage}% of fleet`}
          icon={<Activity className="w-4 h-4" />}
          className={cn(
            "border-l-4",
            (metrics?.healthyBots ?? 0) > 0 ? "border-l-green-500" : "border-l-gray-300"
          )}
        />
        <MetricCard
          title="Degraded"
          value={metrics?.degradedBots ?? 0}
          description={metrics?.degradedBots ? "Needs attention" : "All stable"}
          icon={<AlertTriangle className="w-4 h-4" />}
          className={cn(
            "border-l-4",
            (metrics?.degradedBots ?? 0) > 0 ? "border-l-yellow-500" : "border-l-gray-300"
          )}
        />
        <MetricCard
          title="Unhealthy"
          value={metrics?.unhealthyBots ?? 0}
          description={metrics?.unhealthyBots ? "Action required" : "No issues"}
          icon={<XCircle className="w-4 h-4" />}
          className={cn(
            "border-l-4",
            (metrics?.unhealthyBots ?? 0) > 0 ? "border-l-red-500" : "border-l-gray-300"
          )}
        />
      </div>

      {/* Bots List */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Your Bots</CardTitle>
              <CardDescription>{bots.length} bot{bots.length !== 1 ? "s" : ""} deployed</CardDescription>
            </div>
            <Link href="/bots/new">
              <Button size="sm">
                <Bot className="w-4 h-4 mr-2" />
                Deploy New Bot
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {bots.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No bots deployed yet.</p>
              <Link href="/setup">
                <Button className="mt-4">Deploy your first bot</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {bots.map((bot) => (
                <Link
                  key={bot.id}
                  href={`/bots/${bot.id}`}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Bot className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{bot.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {bot.deploymentType || "DOCKER"}
                        {bot.gatewayPort ? ` · Port ${bot.gatewayPort}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <HealthIndicator health={bot.health} size="sm" />
                    <StatusBadge status={bot.status} />
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fleet Health Breakdown */}
      {fleets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Fleet Health</CardTitle>
            <CardDescription>Health status by fleet</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {health?.fleetHealth.map((fleet) => {
                const healthyPct = fleet.totalInstances > 0
                  ? Math.round((fleet.healthyCount / fleet.totalInstances) * 100)
                  : 0;
                return (
                  <div key={fleet.fleetId} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <Link
                        href={`/fleets/${fleet.fleetId}`}
                        className="font-medium hover:underline"
                      >
                        {fleet.fleetName}
                      </Link>
                      <span className="text-muted-foreground">
                        {fleet.healthyCount}/{fleet.totalInstances} healthy
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={healthyPct} className="h-2 flex-1" />
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {healthyPct}%
                      </span>
                    </div>
                  </div>
                );
              })}
              {!health?.fleetHealth.length && (
                <p className="text-center text-muted-foreground py-4">
                  No fleet health data available.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}
