import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, HealthIndicator } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { MetricCard } from "@/components/dashboard/metric-card";
import { 
  LineChartComponent, 
  BarChartComponent, 
  generateTimeSeriesData 
} from "@/components/ui/charts";
import { TimeDisplay, DurationDisplay } from "@/components/ui/time-display";
import { api, type BotInstance, type Trace, type TraceStats, type ChangeSet } from "@/lib/api";
import { notFound } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, 
  Bot, 
  Activity, 
  RotateCcw, 
  Pause, 
  Play, 
  Trash2,
  Terminal,
  FileText,
  GitBranch,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Zap
} from "lucide-react";

async function getBotInstance(id: string): Promise<BotInstance | null> {
  try {
    return await api.getBotInstance(id);
  } catch (error) {
    return null;
  }
}

async function getBotTraces(id: string): Promise<Trace[]> {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours
    return await api.listTraces({ botInstanceId: id, from, to, limit: 50 });
  } catch (error) {
    return [];
  }
}

async function getBotMetrics(id: string): Promise<TraceStats | null> {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    return await api.getBotInstanceMetrics(id, from, to);
  } catch (error) {
    return null;
  }
}

async function getChangeSets(id: string): Promise<ChangeSet[]> {
  try {
    return await api.listChangeSets({ botInstanceId: id });
  } catch (error) {
    return [];
  }
}

const modelCallsData = generateTimeSeriesData(24, [10, 100]);
const toolCallsData = generateTimeSeriesData(24, [5, 50]);

export default async function BotDetailPage({ params }: { params: { id: string } }) {
  const [bot, traces, metrics, changeSets] = await Promise.all([
    getBotInstance(params.id),
    getBotTraces(params.id),
    getBotMetrics(params.id),
    getChangeSets(params.id),
  ]);

  if (!bot) {
    notFound();
  }

  const recentTraces = traces.slice(0, 10);
  const successRate = metrics && metrics.total > 0
    ? Math.round((metrics.success / metrics.total) * 100)
    : 0;

  return (
    <DashboardLayout>
      {/* Breadcrumb & Header */}
      <div className="mb-6">
        <Link 
          href={bot.fleetId ? `/fleets/${bot.fleetId}` : "/"} 
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Fleet
        </Link>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{bot.name}</h1>
            <p className="text-muted-foreground mt-1">
              Bot instance • {bot.id.slice(0, 8)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <RotateCcw className="w-4 h-4 mr-2" />
              Restart
            </Button>
            {bot.status === 'RUNNING' ? (
              <Button variant="outline" size="sm">
                <Pause className="w-4 h-4 mr-2" />
                Stop
              </Button>
            ) : (
              <Button variant="outline" size="sm">
                <Play className="w-4 h-4 mr-2" />
                Start
              </Button>
            )}
            <Button variant="destructive" size="sm">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex flex-wrap gap-4 mb-8">
        <StatusBadge status={bot.status} />
        <HealthIndicator health={bot.health} />
        {bot.lastError && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1 rounded-full text-sm">
            <AlertCircle className="w-4 h-4" />
            Error state
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <MetricCard
          title="Uptime"
          value={`${Math.floor(bot.uptimeSeconds / 3600)}h ${Math.floor((bot.uptimeSeconds % 3600) / 60)}m`}
          description="Since last restart"
          icon={<Clock className="w-4 h-4" />}
        />
        <MetricCard
          title="Success Rate"
          value={`${successRate}%`}
          description={`${metrics?.success || 0} / ${metrics?.total || 0} requests`}
          icon={<CheckCircle className="w-4 h-4" />}
          className={successRate < 90 ? "border-l-4 border-l-red-500" : successRate < 95 ? "border-l-4 border-l-yellow-500" : ""}
        />
        <MetricCard
          title="Avg Latency"
          value={metrics?.avgDuration ? <DurationDisplay ms={metrics.avgDuration} /> : "N/A"}
          description="Response time"
          icon={<Zap className="w-4 h-4" />}
        />
        <MetricCard
          title="Restarts"
          value={bot.restartCount}
          description="Total restart count"
          icon={<RotateCcw className="w-4 h-4" />}
          className={bot.restartCount > 0 ? "border-l-4 border-l-yellow-500" : ""}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Model Calls</CardTitle>
            <CardDescription>LLM invocations per hour</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChartComponent data={modelCallsData} height={200} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tool Calls</CardTitle>
            <CardDescription>External tool invocations per hour</CardDescription>
          </CardHeader>
          <CardContent>
            <LineChartComponent data={toolCallsData} height={200} />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="traces" className="w-full">
        <TabsList>
          <TabsTrigger active>Traces</TabsTrigger>
          <TabsTrigger>Configuration</TabsTrigger>
          <TabsTrigger>Change Sets</TabsTrigger>
          <TabsTrigger>Logs</TabsTrigger>
        </TabsList>

        <TabsContent active className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Traces</CardTitle>
                  <CardDescription>Last 24 hours of execution traces</CardDescription>
                </div>
                <Link href={`/traces?botInstanceId=${bot.id}`}>
                  <Button variant="outline" size="sm">View All</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trace ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTraces.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No traces found for this bot in the last 24 hours.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentTraces.map((trace) => (
                      <TableRow key={trace.id}>
                        <TableCell className="font-mono text-xs">
                          <Link href={`/traces/${trace.traceId}`} className="hover:underline">
                            {trace.traceId.slice(0, 16)}...
                          </Link>
                        </TableCell>
                        <TableCell>{trace.name}</TableCell>
                        <TableCell className="capitalize">{trace.type.toLowerCase()}</TableCell>
                        <TableCell>
                          {trace.status === 'SUCCESS' ? (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="w-4 h-4" />
                              Success
                            </span>
                          ) : trace.status === 'ERROR' ? (
                            <span className="flex items-center gap-1 text-red-600">
                              <XCircle className="w-4 h-4" />
                              Error
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-yellow-600">
                              <Clock className="w-4 h-4" />
                              Pending
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {trace.durationMs ? <DurationDisplay ms={trace.durationMs} /> : "-"}
                        </TableCell>
                        <TableCell>
                          <TimeDisplay date={trace.startedAt} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Current manifest and settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium mb-2">Desired Manifest</h3>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto max-h-96">
                    {JSON.stringify(bot.desiredManifest, null, 2)}
                  </pre>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm text-muted-foreground">Applied Version</dt>
                    <dd className="font-mono text-sm">{bot.appliedManifestVersion || "Not applied"}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Template</dt>
                    <dd className="text-sm">{bot.templateId || "None"}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Profile</dt>
                    <dd className="text-sm">{bot.profileId || "None"}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">ECS Service</dt>
                    <dd className="font-mono text-sm truncate">{bot.ecsServiceArn || "Not configured"}</dd>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Change Sets</CardTitle>
                  <CardDescription>Configuration changes for this bot</CardDescription>
                </div>
                <Link href={`/changesets?botInstanceId=${bot.id}`}>
                  <Button variant="outline" size="sm">View All</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changeSets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No change sets found for this bot.
                      </TableCell>
                    </TableRow>
                  ) : (
                    changeSets.slice(0, 10).map((cs) => (
                      <TableRow key={cs.id}>
                        <TableCell className="capitalize">{cs.changeType.toLowerCase()}</TableCell>
                        <TableCell>{cs.description}</TableCell>
                        <TableCell>
                          <StatusBadge status={cs.status} />
                        </TableCell>
                        <TableCell className="capitalize">
                          {cs.rolloutStrategy.toLowerCase()}
                          {cs.rolloutPercentage && ` (${cs.rolloutPercentage}%)`}
                        </TableCell>
                        <TableCell>
                          <TimeDisplay date={cs.createdAt} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Last Error Alert */}
      {bot.lastError && (
        <Card className="mt-8 border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Last Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-red-700 text-sm whitespace-pre-wrap">{bot.lastError}</pre>
            <p className="text-red-600 text-xs mt-2">
              Error count: {bot.errorCount}
            </p>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}
