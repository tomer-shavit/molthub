"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { TimeDisplay } from "@/components/ui/time-display";
import { Input } from "@/components/ui/input";
import { api, type ChangeSet, type ChangeSetStatus } from "@/lib/api";
import Link from "next/link";
import { 
  ArrowLeft, 
  Play, 
  RotateCcw, 
  GitCommit,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  ChevronLeft
} from "lucide-react";

// Diff viewer component
function DiffViewer({ from, to }: { from?: Record<string, unknown>; to: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      {from && (
        <div>
          <h4 className="text-sm font-medium text-red-600 mb-2 flex items-center gap-2">
            <ChevronLeft className="w-4 h-4" />
            From (Previous)
          </h4>
          <pre className="bg-red-50 p-4 rounded-lg text-xs overflow-auto border border-red-200">
            {JSON.stringify(from, null, 2)}
          </pre>
        </div>
      )}
      <div>
        <h4 className="text-sm font-medium text-green-600 mb-2 flex items-center gap-2">
          <ChevronRight className="w-4 h-4" />
          To (New)
        </h4>
        <pre className="bg-green-50 p-4 rounded-lg text-xs overflow-auto border border-green-200">
          {JSON.stringify(to, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// Canary control component
function CanaryControl({ 
  changeSet, 
  onStart, 
  onRollback 
}: { 
  changeSet: ChangeSet; 
  onStart: () => void;
  onRollback: (reason: string) => void;
}) {
  const [rollbackReason, setRollbackReason] = useState("");
  const [showRollbackInput, setShowRollbackInput] = useState(false);

  const progress = changeSet.totalInstances > 0
    ? Math.round(((changeSet.updatedInstances + changeSet.failedInstances) / changeSet.totalInstances) * 100)
    : 0;

  if (changeSet.status === 'PENDING') {
    return (
      <div className="bg-muted p-6 rounded-lg">
        <h3 className="font-semibold mb-2">Ready to Rollout</h3>
        <p className="text-sm text-muted-foreground mb-4">
          This change set is pending and ready to be applied.
        </p>
        <Button onClick={onStart}>
          <Play className="w-4 h-4 mr-2" />
          Start Rollout
        </Button>
      </div>
    );
  }

  if (changeSet.status === 'IN_PROGRESS') {
    return (
      <div className="bg-muted p-6 rounded-lg">
        <h3 className="font-semibold mb-4">Rollout in Progress</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Progress</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-3" />
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-background p-3 rounded">
              <div className="text-2xl font-bold text-green-600">{changeSet.updatedInstances}</div>
              <div className="text-xs text-muted-foreground">Updated</div>
            </div>
            <div className="bg-background p-3 rounded">
              <div className="text-2xl font-bold text-red-600">{changeSet.failedInstances}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
            <div className="bg-background p-3 rounded">
              <div className="text-2xl font-bold">{changeSet.totalInstances - changeSet.updatedInstances - changeSet.failedInstances}</div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </div>
          </div>
          
          {!showRollbackInput ? (
            <Button variant="destructive" onClick={() => setShowRollbackInput(true)}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Rollback
            </Button>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="Enter rollback reason..."
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
              />
              <div className="flex gap-2">
                <Button 
                  variant="destructive" 
                  onClick={() => onRollback(rollbackReason)}
                  disabled={!rollbackReason}
                >
                  Confirm Rollback
                </Button>
                <Button variant="outline" onClick={() => setShowRollbackInput(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (changeSet.status === 'COMPLETED') {
    return (
      <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
        <div className="flex items-center gap-2 text-green-700 mb-2">
          <CheckCircle className="w-5 h-5" />
          <h3 className="font-semibold">Rollout Completed</h3>
        </div>
        <p className="text-sm text-green-600 mb-4">
          All instances have been successfully updated.
        </p>
        {changeSet.canRollback && !changeSet.rolledBackAt && (
          !showRollbackInput ? (
            <Button variant="outline" onClick={() => setShowRollbackInput(true)}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Rollback
            </Button>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="Enter rollback reason..."
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
              />
              <div className="flex gap-2">
                <Button 
                  variant="destructive" 
                  onClick={() => onRollback(rollbackReason)}
                  disabled={!rollbackReason}
                >
                  Confirm Rollback
                </Button>
                <Button variant="outline" onClick={() => setShowRollbackInput(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )
        )}
      </div>
    );
  }

  if (changeSet.status === 'FAILED') {
    return (
      <div className="bg-red-50 border border-red-200 p-6 rounded-lg">
        <div className="flex items-center gap-2 text-red-700 mb-2">
          <XCircle className="w-5 h-5" />
          <h3 className="font-semibold">Rollout Failed</h3>
        </div>
        <p className="text-sm text-red-600">
          The rollout encountered errors. Please check the logs for details.
        </p>
      </div>
    );
  }

  if (changeSet.status === 'ROLLED_BACK' || changeSet.rolledBackAt) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-lg">
        <div className="flex items-center gap-2 text-yellow-700 mb-2">
          <RotateCcw className="w-5 h-5" />
          <h3 className="font-semibold">Rolled Back</h3>
        </div>
        <p className="text-sm text-yellow-600">
          This change was rolled back on <TimeDisplay date={changeSet.rolledBackAt!} format="absolute" />.
        </p>
      </div>
    );
  }

  return null;
}

export default function ChangeSetDetailPage({ params }: { params: { id: string } }) {
  const [changeSet, setChangeSet] = useState<ChangeSet | null>(null);
  const [rolloutStatus, setRolloutStatus] = useState<ChangeSetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadChangeSet() {
    try {
      const [cs, status] = await Promise.all([
        api.getChangeSet(params.id),
        api.getChangeSetStatus(params.id),
      ]);
      setChangeSet(cs);
      setRolloutStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load change set");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadChangeSet();
  }, [params.id]);

  async function handleStart() {
    try {
      await api.startRollout(params.id);
      loadChangeSet();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start rollout");
    }
  }

  async function handleRollback(reason: string) {
    try {
      await api.rollbackChangeSet(params.id, reason);
      loadChangeSet();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to rollback");
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !changeSet) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64">
          <XCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold">Change Set not found</h2>
          <p className="text-muted-foreground mt-2">{error || "The change set could not be loaded"}</p>
          <Link href="/changesets">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Change Sets
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-6">
        <Link 
          href="/changesets" 
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Change Sets
        </Link>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Change Set Details</h1>
            <p className="text-muted-foreground mt-1">
              ID: <code className="bg-muted px-1 rounded">{changeSet.id}</code>
            </p>
          </div>
          <StatusBadge status={changeSet.status} className="text-base px-4 py-1" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Controls */}
        <div className="space-y-6">
          <CanaryControl 
            changeSet={changeSet} 
            onStart={handleStart}
            onRollback={handleRollback}
          />

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm text-muted-foreground">Bot Instance</dt>
                  <dd>
                    {changeSet.botInstance ? (
                      <Link 
                        href={`/bots/${changeSet.botInstance.id}`}
                        className="font-medium hover:underline"
                      >
                        {changeSet.botInstance.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Change Type</dt>
                  <dd className="capitalize">{changeSet.changeType.toLowerCase()}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Rollout Strategy</dt>
                  <dd className="capitalize">
                    {changeSet.rolloutStrategy.toLowerCase()}
                    {changeSet.rolloutPercentage && ` (${changeSet.rolloutPercentage}%)`}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Created By</dt>
                  <dd>{changeSet.createdBy}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Created At</dt>
                  <dd><TimeDisplay date={changeSet.createdAt} format="absolute" /></dd>
                </div>
                {changeSet.startedAt && (
                  <div>
                    <dt className="text-sm text-muted-foreground">Started At</dt>
                    <dd><TimeDisplay date={changeSet.startedAt} format="absolute" /></dd>
                  </div>
                )}
                {changeSet.completedAt && (
                  <div>
                    <dt className="text-sm text-muted-foreground">Completed At</dt>
                    <dd><TimeDisplay date={changeSet.completedAt} format="absolute" /></dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Details */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="diff" className="w-full">
            <TabsList>
              <TabsTrigger active>Changes</TabsTrigger>
              <TabsTrigger>Progress</TabsTrigger>
              <TabsTrigger>Events</TabsTrigger>
            </TabsList>

            <TabsContent active className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Configuration Changes</CardTitle>
                  <CardDescription>
                    Diff between previous and new configuration
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DiffViewer from={changeSet.fromManifest} to={changeSet.toManifest} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Rollout Progress</CardTitle>
                  <CardDescription>
                    Real-time progress of the rollout
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {rolloutStatus ? (
                    <div className="space-y-6">
                      <div>
                        <div className="flex justify-between mb-2">
                          <span className="font-medium">Overall Progress</span>
                          <span>{rolloutStatus.progress.percentage}%</span>
                        </div>
                        <Progress value={rolloutStatus.progress.percentage} className="h-4" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-muted p-4 rounded-lg">
                          <div className="text-3xl font-bold">{rolloutStatus.progress.total}</div>
                          <div className="text-sm text-muted-foreground">Total Instances</div>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                          <div className="text-3xl font-bold text-green-600">{rolloutStatus.progress.updated}</div>
                          <div className="text-sm text-green-600">Updated</div>
                        </div>
                        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                          <div className="text-3xl font-bold text-red-600">{rolloutStatus.progress.failed}</div>
                          <div className="text-sm text-red-600">Failed</div>
                        </div>
                        <div className="bg-muted p-4 rounded-lg">
                          <div className="text-3xl font-bold">{rolloutStatus.progress.remaining}</div>
                          <div className="text-sm text-muted-foreground">Remaining</div>
                        </div>
                      </div>
                      {rolloutStatus.canRollback && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-yellow-50 p-3 rounded border border-yellow-200">
                          <AlertTriangle className="w-4 h-4 text-yellow-600" />
                          This change set can be rolled back if needed.
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Rollout status not available.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Audit Events</CardTitle>
                  <CardDescription>
                    Events related to this change set
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {changeSet.auditEvents && changeSet.auditEvents.length > 0 ? (
                    <div className="space-y-4">
                      {changeSet.auditEvents.map((event: any) => (
                        <div key={event.id} className="flex items-start gap-3 pb-4 border-b last:border-0">
                          <div className="mt-0.5">
                            {event.action.includes('CREATE') ? (
                              <GitCommit className="w-4 h-4 text-blue-500" />
                            ) : event.action.includes('START') ? (
                              <Play className="w-4 h-4 text-green-500" />
                            ) : event.action.includes('ROLLBACK') ? (
                              <RotateCcw className="w-4 h-4 text-yellow-500" />
                            ) : (
                              <Clock className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{event.action}</p>
                            <p className="text-sm text-muted-foreground">
                              by {event.actor} • <TimeDisplay date={event.timestamp} />
                            </p>
                            {event.diffSummary && (
                              <p className="text-sm mt-1">{event.diffSummary}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No audit events found.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
