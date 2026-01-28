export const dynamic = 'force-dynamic';

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
import { TimeDisplay } from "@/components/ui/time-display";
import { api, type Instance, type ManifestVersion, type DeploymentEvent } from "@/lib/api";
import { notFound } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, 
  Bot, 
  RotateCcw, 
  Pause, 
  Play, 
  Trash2,
  FileText,
  GitBranch,
  Terminal,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Activity,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

async function getInstanceData(id: string) {
  try {
    const [instance, manifests, events] = await Promise.all([
      api.getInstance(id),
      api.listManifests(id),
      api.listDeploymentEvents(id),
    ]);
    return { instance, manifests, events };
  } catch (error) {
    console.error("Failed to fetch instance data:", error);
    return { instance: null, manifests: [], events: [] };
  }
}

function getEventIcon(eventType: string) {
  switch (eventType) {
    case 'RECONCILE_SUCCESS': return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'RECONCILE_ERROR': return <XCircle className="w-4 h-4 text-red-500" />;
    case 'ECS_DEPLOYMENT': return <Activity className="w-4 h-4 text-blue-500" />;
    case 'ECS_ROLLBACK': return <RotateCcw className="w-4 h-4 text-yellow-500" />;
    default: return <Activity className="w-4 h-4 text-muted-foreground" />;
  }
}

export default async function InstanceDetailPage({ params }: { params: { id: string } }) {
  const { instance, manifests, events } = await getInstanceData(params.id);

  if (!instance) {
    notFound();
  }

  const recentManifests = manifests.slice(0, 5);
  const recentEvents = events.slice(0, 10);

  return (
    <DashboardLayout>
      {/* Header */}
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
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{instance.name}</h1>
              <StatusBadge status={instance.status} />
            </div>
            <p className="text-muted-foreground mt-1">
              Instance • {instance.id.slice(0, 8)} • {instance.environment}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <form action={`/api/instances/${instance.id}/actions/restart`} method="POST">
              <Button type="submit" variant="outline" size="sm">
                <RotateCcw className="w-4 h-4 mr-2" />
                Restart
              </Button>
            </form>
            <form action={`/api/instances/${instance.id}/actions/stop`} method="POST">
              <Button type="submit" variant="outline" size="sm">
                <Pause className="w-4 h-4 mr-2" />
                Stop
              </Button>
            </form>
            <form action={`/api/instances/${instance.id}`} method="POST">
              <input type="hidden" name="_method" value="DELETE" />
              <Button type="submit" variant="destructive" size="sm">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <MetricCard
          title="Status"
          value={instance.status}
          description="Current state"
          icon={<Activity className="w-4 h-4" />}
        />
        <MetricCard
          title="Environment"
          value={instance.environment}
          description="Deployment environment"
          icon={<Bot className="w-4 h-4" />}
        />
        <MetricCard
          title="Manifest Version"
          value={manifests.length > 0 ? manifests[0].version : "N/A"}
          description="Latest version"
          icon={<FileText className="w-4 h-4" />}
        />
        <MetricCard
          title="Created"
          value={new Date(instance.createdAt).toLocaleDateString()}
          description={new Date(instance.createdAt).toLocaleTimeString()}
          icon={<Clock className="w-4 h-4" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Instance details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">ID</dt>
                  <dd className="font-mono">{instance.id.slice(0, 16)}...</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Workspace</dt>
                  <dd>{instance.workspaceId}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last Reconcile</dt>
                  <dd>
                    {instance.lastReconcileAt ? (
                      <TimeDisplay date={instance.lastReconcileAt} />
                    ) : (
                      "Never"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd><TimeDisplay date={instance.updatedAt} /></dd>
                </div>
              </div>
              
              {instance.ecsServiceArn && (
                <div className="pt-4 border-t">
                  <dt className="text-muted-foreground text-sm mb-1">ECS Service</dt>
                  <dd className="font-mono text-xs break-all">{instance.ecsServiceArn}</dd>
                </div>
              )}
              
              {instance.cloudwatchLogGroup && (
                <div className="pt-4 border-t">
                  <dt className="text-muted-foreground text-sm mb-1">Log Group</dt>
                  <dd className="font-mono text-xs">{instance.cloudwatchLogGroup}</dd>
                  <a 
                    href={`https://console.aws.amazon.com/cloudwatch/home#logsV2:log-groups/log-group/${encodeURIComponent(instance.cloudwatchLogGroup)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                  >
                    View Logs
                    <ChevronRight className="w-4 h-4" />
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tags */}
          {Object.keys(instance.tags).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(instance.tags).map(([key, value]) => (
                    <span 
                      key={key}
                      className="px-2 py-1 bg-muted rounded text-xs"
                    >
                      {key}: {value}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="manifests" className="w-full">
            <TabsList className="w-full justify-start">
              <TabsTrigger active>Manifests</TabsTrigger>
              <TabsTrigger>Events</TabsTrigger>
              <TabsTrigger>Logs</TabsTrigger>
            </TabsList>

            <TabsContent active className="mt-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Manifest History</CardTitle>
                    <CardDescription>Versioned configuration history</CardDescription>
                  </div>
                  <Link href={`/instances/${instance.id}/manifests/new`}>
                    <Button size="sm">
                      <GitBranch className="w-4 h-4 mr-2" />
                      New Version
                    </Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Version</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentManifests.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No manifests found.</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        recentManifests.map((manifest) => (
                          <TableRow key={manifest.id}>
                            <TableCell className="font-medium">
                              Version {manifest.version}
                            </TableCell>
                            <TableCell>
                              <TimeDisplay date={manifest.createdAt} />
                            </TableCell>
                            <TableCell>{manifest.createdBy}</TableCell>
                            <TableCell>
                              <Link href={`/instances/${instance.id}/manifests/${manifest.version}`}>
                                <Button variant="ghost" size="sm">View</Button>
                              </Link>
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
                  <CardTitle>Deployment Events</CardTitle>
                  <CardDescription>Recent deployment and reconciliation events</CardDescription>
                </CardHeader>
                <CardContent>
                  {recentEvents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No deployment events found.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {recentEvents.map((event) => (
                        <div key={event.id} className="flex items-start gap-3 pb-4 border-b last:border-0">
                          <div className="mt-0.5">
                            {getEventIcon(event.eventType)}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{event.eventType}</p>
                            <p className="text-sm text-muted-foreground">{event.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              <TimeDisplay date={event.createdAt} />
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Terminal className="w-5 h-5" />
                    Logs
                  </CardTitle>
                  <CardDescription>Instance execution logs</CardDescription>
                </CardHeader>
                <CardContent>
                  {instance.cloudwatchLogGroup ? (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Logs are stored in CloudWatch. Click below to view them in the AWS Console.
                      </p>
                      <a 
                        href={`https://console.aws.amazon.com/cloudwatch/home#logsV2:log-groups/log-group/${encodeURIComponent(instance.cloudwatchLogGroup)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-primary hover:underline"
                      >
                        View logs in CloudWatch
                        <ChevronRight className="w-4 h-4" />
                      </a>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Terminal className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No log group configured for this instance.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Last Error Alert */}
      {instance.lastError && (
        <Card className="mt-8 border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Last Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-red-700 text-sm whitespace-pre-wrap overflow-auto max-h-48">
              {instance.lastError}
            </pre>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}
