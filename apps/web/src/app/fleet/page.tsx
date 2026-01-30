export const dynamic = 'force-dynamic';

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, HealthIndicator } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { TimeDisplay } from "@/components/ui/time-display";
import { api } from "@/lib/api";
import Link from "next/link";
import { 
  Bot, 
  Activity, 
  AlertTriangle, 
  Clock, 
  DollarSign, 
  MessageSquare, 
  Search,
  RefreshCw,
  Layers,
  ArrowRight,
  Zap,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Play
} from "lucide-react";
import { cn } from "@/lib/utils";

async function getDashboardData() {
  try {
    const [metrics, health, fleets] = await Promise.all([
      api.getDashboardMetrics(),
      api.getDashboardHealth(),
      api.listFleets(),
    ]);
    return { metrics, health, fleets };
  } catch (error) {
    console.error("Failed to fetch dashboard data:", error);
    return { metrics: null, health: null, fleets: [] };
  }
}

export default async function FleetDashboardPage() {
  const { metrics, health, fleets } = await getDashboardData();

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
            <h1 className="text-3xl font-bold tracking-tight">Fleet Health Dashboard</h1>
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
            Real-time overview of your Moltbot fleet
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

      {/* Executive Metrics Grid */}
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

      {/* Performance Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <MetricCard
          title="Message Volume"
          value={metrics?.messageVolume.toLocaleString() ?? "0"}
          description="Messages in last hour"
          icon={<MessageSquare className="w-4 h-4" />}
        />
        <MetricCard
          title="Latency (p95)"
          value={`${Math.round(metrics?.latencyP95 ?? 0)}ms`}
          description="Response time"
          icon={<Zap className="w-4 h-4" />}
        />
        <MetricCard
          title="Failure Rate"
          value={`${metrics?.failureRate ?? 0}%`}
          description="Error percentage"
          icon={<AlertCircle className="w-4 h-4" />}
          className={(metrics?.failureRate ?? 0) > 1 ? "border-l-4 border-l-red-500" : ""}
        />
        <MetricCard
          title="Cost (Hourly)"
          value={`$${metrics?.costPerHour ?? 0}`}
          description="Estimated AWS spend"
          icon={<DollarSign className="w-4 h-4" />}
        />
      </div>

      {/* Health Breakdown & Active Operations */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        {/* Fleet Health Summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Fleet Health Breakdown</CardTitle>
                <CardDescription>Health status by fleet</CardDescription>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Healthy
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  Degraded
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Unhealthy
                </span>
              </div>
            </div>
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
                  No fleets found. Create your first fleet to get started.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Active Operations */}
        <Card>
          <CardHeader>
            <CardTitle>Active Operations</CardTitle>
            <CardDescription>Current activities</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded">
                    <Play className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Active Change Sets</p>
                    <p className="text-xs text-muted-foreground">In progress</p>
                  </div>
                </div>
                <span className="text-lg font-bold">{metrics?.activeChangeSets ?? 0}</span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded">
                    <XCircle className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Failed Deployments</p>
                    <p className="text-xs text-muted-foreground">Last hour</p>
                  </div>
                </div>
                <span className={cn(
                  "text-lg font-bold",
                  (metrics?.failedDeployments ?? 0) > 0 && "text-red-600"
                )}>
                  {metrics?.failedDeployments ?? 0}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded">
                    <Clock className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Avg Latency</p>
                    <p className="text-xs text-muted-foreground">p50</p>
                  </div>
                </div>
                <span className="text-lg font-bold">
                  {Math.round(metrics?.latencyP50 ?? 0)}ms
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Alerts */}
      {health?.recentAlerts && health.recentAlerts.length > 0 && (
        <Card className="mb-8 border-orange-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Recent Alerts
            </CardTitle>
            <CardDescription>Issues requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {health.recentAlerts.slice(0, 5).map((alert) => (
                <div 
                  key={alert.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg",
                    alert.severity === "CRITICAL" && "bg-red-50",
                    alert.severity === "WARNING" && "bg-yellow-50",
                    alert.severity === "INFO" && "bg-blue-50"
                  )}
                >
                  {alert.severity === "CRITICAL" ? <XCircle className="w-4 h-4 text-red-500" /> :
                   alert.severity === "WARNING" ? <AlertTriangle className="w-4 h-4 text-yellow-500" /> :
                   <AlertCircle className="w-4 h-4 text-blue-500" />}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{alert.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {alert.resourceType} • <TimeDisplay date={alert.timestamp} />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fleets Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Fleets</CardTitle>
              <CardDescription>Manage your bot fleets</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search fleets..."
                  className="pl-8 w-[250px]"
                />
              </div>
              <Link href="/fleets/new">
                <Button variant="outline" size="sm">
                  <Layers className="w-4 h-4 mr-2" />
                  New Fleet
                </Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Instances</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fleets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No fleets found.</p>
                    <Link href="/fleets/new">
                      <Button className="mt-4">Create your first fleet</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ) : (
                fleets.map((fleet) => {
                  const fleetHealthInfo = health?.fleetHealth.find(f => f.fleetId === fleet.id);
                  const healthStatus = fleetHealthInfo 
                    ? fleetHealthInfo.unhealthyCount > 0 ? "UNHEALTHY" :
                      fleetHealthInfo.degradedCount > 0 ? "DEGRADED" : "HEALTHY"
                    : "UNKNOWN";
                  
                  return (
                    <TableRow key={fleet.id}>
                      <TableCell className="font-medium">
                        <Link href={`/fleets/${fleet.id}`} className="hover:underline">
                          {fleet.name}
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize">{fleet.environment}</TableCell>
                      <TableCell>
                        <HealthIndicator 
                          health={healthStatus} 
                          showLabel={false}
                          size="sm"
                        />
                      </TableCell>
                      <TableCell>{fleet._count?.instances ?? 0}</TableCell>
                      <TableCell>
                        <StatusBadge status={fleet.status} />
                      </TableCell>
                      <TableCell>
                        <Link href={`/fleets/${fleet.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                            <ArrowRight className="w-4 h-4 ml-1" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
