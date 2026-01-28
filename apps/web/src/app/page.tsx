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
import { 
  LineChartComponent, 
  AreaChartComponent, 
  generateTimeSeriesData 
} from "@/components/ui/charts";
import { TimeDisplay } from "@/components/ui/time-display";
import { api, type Fleet, type FleetHealth } from "@/lib/api";
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
  ArrowRight
} from "lucide-react";
import Link from "next/link";

async function getFleets(): Promise<Fleet[]> {
  try {
    return await api.listFleets();
  } catch (error) {
    console.error("Failed to fetch fleets:", error);
    return [];
  }
}

async function getFleetHealth(fleetId: string): Promise<FleetHealth | null> {
  try {
    return await api.getFleetHealth(fleetId);
  } catch (error) {
    console.error(`Failed to fetch health for fleet ${fleetId}:`, error);
    return null;
  }
}

// Generate mock metrics data
const messageVolumeData = generateTimeSeriesData(24, [100, 500]);
const latencyData = generateTimeSeriesData(24, [50, 200]);
const errorRateData = generateTimeSeriesData(24, [0, 5]);

export default async function DashboardPage() {
  const fleets = await getFleets();
  
  // Get health for each fleet
  const fleetsWithHealth = await Promise.all(
    fleets.map(async (fleet) => {
      const health = await getFleetHealth(fleet.id);
      return { ...fleet, health };
    })
  );

  // Calculate aggregate metrics
  const totalBots = fleets.reduce((sum, f) => sum + (f._count?.instances || 0), 0);
  const totalHealthy = fleetsWithHealth.reduce((sum, f) => sum + (f.health?.healthyCount || 0), 0);
  const totalDegraded = fleetsWithHealth.reduce((sum, f) => sum + (f.health?.degradedCount || 0), 0);
  const totalUnhealthy = fleetsWithHealth.reduce((sum, f) => sum + (f.health?.unhealthyCount || 0), 0);

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fleet Health Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Executive overview of your Moltbot fleet
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Executive Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <MetricCard
          title="Total Bots"
          value={totalBots}
          description="Across all fleets"
          icon={<Bot className="w-4 h-4" />}
        />
        <MetricCard
          title="Healthy"
          value={totalHealthy}
          description={`${totalBots > 0 ? Math.round((totalHealthy / totalBots) * 100) : 0}% of fleet`}
          trend={{ value: 5, direction: "up", label: "vs last hour" }}
          icon={<Activity className="w-4 h-4" />}
          className="border-l-4 border-l-green-500"
        />
        <MetricCard
          title="Degraded"
          value={totalDegraded}
          description={totalDegraded > 0 ? "Needs attention" : "All systems normal"}
          icon={<AlertTriangle className="w-4 h-4" />}
          className={totalDegraded > 0 ? "border-l-4 border-l-yellow-500" : ""}
        />
        <MetricCard
          title="Unhealthy"
          value={totalUnhealthy}
          description={totalUnhealthy > 0 ? "Immediate action required" : "No issues"}
          icon={<AlertTriangle className="w-4 h-4" />}
          className={totalUnhealthy > 0 ? "border-l-4 border-l-red-500" : ""}
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <MetricCard
          title="Message Volume"
          value="12.5K"
          description="Messages in last hour"
          trend={{ value: 12, direction: "up", label: "vs previous hour" }}
          icon={<MessageSquare className="w-4 h-4" />}
        />
        <MetricCard
          title="Latency (p95)"
          value="142ms"
          description="Response time"
          trend={{ value: 8, direction: "down", label: "vs previous hour" }}
          icon={<Clock className="w-4 h-4" />}
        />
        <MetricCard
          title="Failure Rate"
          value="0.3%"
          description="Error percentage"
          trend={{ value: 2, direction: "down", label: "vs previous hour" }}
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <MetricCard
          title="Cost (Hourly)"
          value="$24.50"
          description="Estimated AWS spend"
          trend={{ value: 3, direction: "up", label: "vs previous hour" }}
          icon={<DollarSign className="w-4 h-4" />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Message Volume</CardTitle>
            <CardDescription>Last 24 hours</CardDescription>
          </CardHeader>
          <CardContent>
            <AreaChartComponent data={messageVolumeData} height={200} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Latency (p95)</CardTitle>
            <CardDescription>Milliseconds</CardDescription>
          </CardHeader>
          <CardContent>
            <LineChartComponent data={latencyData} height={200} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Error Rate</CardTitle>
            <CardDescription>Percentage</CardDescription>
          </CardHeader>
          <CardContent>
            <AreaChartComponent data={errorRateData} height={200} />
          </CardContent>
        </Card>
      </div>

      {/* Fleets Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Fleet Status</CardTitle>
              <CardDescription>Overview of all fleets and their health</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search fleets..."
                  className="pl-8 w-[250px]"
                />
              </div>
              <Button variant="outline" size="sm">
                <Layers className="w-4 h-4 mr-2" />
                New Fleet
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Instances</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fleetsWithHealth.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No fleets found. Create your first fleet to get started.
                  </TableCell>
                </TableRow>
              ) : (
                fleetsWithHealth.map((fleet) => (
                  <TableRow key={fleet.id}>
                    <TableCell className="font-medium">
                      <Link href={`/fleets/${fleet.id}`} className="hover:underline">
                        {fleet.name}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">{fleet.environment}</TableCell>
                    <TableCell>
                      <StatusBadge status={fleet.status} />
                    </TableCell>
                    <TableCell>
                      {fleet.health ? (
                        <div className="flex items-center gap-2">
                          <HealthIndicator 
                            health={
                              fleet.health.unhealthyCount > 0 ? "UNHEALTHY" :
                              fleet.health.degradedCount > 0 ? "DEGRADED" :
                              fleet.health.healthyCount > 0 ? "HEALTHY" : "UNKNOWN"
                            } 
                            showLabel={false}
                            size="sm"
                          />
                          <span className="text-sm text-muted-foreground">
                            {fleet.health.healthyCount}/{fleet.health.totalInstances}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{fleet._count?.instances || 0}</TableCell>
                    <TableCell>
                      <TimeDisplay date={fleet.updatedAt} />
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
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
