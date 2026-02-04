export const dynamic = 'force-dynamic';

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FleetDetailTabs } from "./fleet-detail-tabs";
import { PromoteFleetDialog } from "./promote-fleet-dialog";
import { Progress } from "@/components/ui/progress";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ClientAreaChart } from "@/components/ui/client-chart";
import { api, type Fleet, type FleetHealth, type BotInstance } from "@/lib/api";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Bot,
  Activity,
  Settings,
  Play,
  Pause,
  CheckCircle,
  Layers,
  Wifi,
  Server
} from "lucide-react";

async function getFleet(id: string): Promise<Fleet | null> {
  try {
    return await api.getFleet(id);
  } catch (error) {
    return null;
  }
}

async function getFleetHealth(id: string): Promise<FleetHealth | null> {
  try {
    return await api.getFleetHealth(id);
  } catch (error) {
    return null;
  }
}

export default async function FleetDetailPage({ params }: { params: { id: string } }) {
  const [fleet, health] = await Promise.all([
    getFleet(params.id),
    getFleetHealth(params.id),
  ]);

  if (!fleet) {
    notFound();
  }

  const healthPercentage = health && health.totalInstances > 0
    ? Math.round((health.healthyCount / health.totalInstances) * 100)
    : 0;

  return (
    <DashboardLayout>
      {/* Breadcrumb & Header */}
      <div className="mb-6">
        <Link 
          href="/" 
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{fleet.name}</h1>
            <p className="text-muted-foreground mt-1">
              {fleet.description || `Fleet in ${fleet.environment} environment`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PromoteFleetDialog fleet={fleet} />
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
            {fleet.status === 'ACTIVE' ? (
              <Button variant="outline" size="sm">
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </Button>
            ) : (
              <Button variant="outline" size="sm">
                <Play className="w-4 h-4 mr-2" />
                Resume
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Fleet Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <MetricCard
          title="Status"
          value={fleet.status}
          description="Fleet operational status"
          icon={<Layers className="w-4 h-4" />}
        />
        <MetricCard
          title="Total Instances"
          value={fleet.instances?.length || 0}
          description="Bot instances in fleet"
          icon={<Bot className="w-4 h-4" />}
        />
        <MetricCard
          title="Health Score"
          value={`${healthPercentage}%`}
          description={`${health?.healthyCount || 0} of ${health?.totalInstances || 0} healthy`}
          icon={<Activity className="w-4 h-4" />}
          className={healthPercentage < 50 ? "border-l-4 border-l-red-500" : healthPercentage < 80 ? "border-l-4 border-l-yellow-500" : "border-l-4 border-l-green-500"}
        />
        <MetricCard
          title="Environment"
          value={fleet.environment}
          description="Deployment environment"
          icon={<CheckCircle className="w-4 h-4" />}
        />
      </div>

      {/* Health Breakdown */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Health Breakdown</CardTitle>
            <CardDescription>Instance health distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    Healthy
                  </span>
                  <span className="font-medium">{health?.healthyCount || 0}</span>
                </div>
                <Progress value={health?.totalInstances ? (health.healthyCount / health.totalInstances) * 100 : 0} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-500" />
                    Degraded
                  </span>
                  <span className="font-medium">{health?.degradedCount || 0}</span>
                </div>
                <Progress value={health?.totalInstances ? (health.degradedCount / health.totalInstances) * 100 : 0} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    Unhealthy
                  </span>
                  <span className="font-medium">{health?.unhealthyCount || 0}</span>
                </div>
                <Progress value={health?.totalInstances ? (health.unhealthyCount / health.totalInstances) * 100 : 0} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    Unknown
                  </span>
                  <span className="font-medium">{health?.unknownCount || 0}</span>
                </div>
                <Progress value={health?.totalInstances ? (health.unknownCount / health.totalInstances) * 100 : 0} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Throughput</CardTitle>
            <CardDescription>Messages per minute</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientAreaChart height={200} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fleet Configuration</CardTitle>
            <CardDescription>Deployment targets and connections</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5" />
                  Gateway Connections
                </dt>
                <dd className="text-sm font-medium mt-0.5">
                  {fleet.instances
                    ? `${fleet.instances.filter((i: BotInstance) => i.status === "RUNNING").length} / ${fleet.instances.length} connected`
                    : "N/A"
                  }
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5" />
                  Deployment Targets
                </dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {fleet.instances && fleet.instances.length > 0
                    ? [...new Set(fleet.instances.map((i: BotInstance) => i.deploymentType).filter(Boolean))].map((dt) => (
                        <Badge key={dt as string} variant="outline" className="text-xs">{dt as string}</Badge>
                      ))
                    : <span className="text-sm text-muted-foreground">None</span>
                  }
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Default Profile</dt>
                <dd className="text-sm">{fleet.defaultProfileId || "None"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Instances & Profiles Tabs */}
      <FleetDetailTabs fleet={fleet} />
    </DashboardLayout>
  );
}
