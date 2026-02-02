"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TimeDisplay } from "@/components/ui/time-display";
import { api, type Fleet, type BotInstance, type AgentCard } from "@/lib/api";
import { Bot, Sparkles, MessageSquare, Loader2, RefreshCw } from "lucide-react";

interface FleetDetailTabsProps {
  fleet: Fleet;
}

interface BotProfile {
  instanceId: string;
  instanceName: string;
  status: BotInstance["status"];
  card: AgentCard | null;
  error: string | null;
}

export function FleetDetailTabs({ fleet }: FleetDetailTabsProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("instances");
  const [profiles, setProfiles] = useState<BotProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [profilesFetched, setProfilesFetched] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<{ queued: number; skipped: number } | null>(null);

  async function handleReconcileAll() {
    setReconciling(true);
    setReconcileResult(null);
    try {
      const result = await api.reconcileAllFleet(fleet.id);
      setReconcileResult(result);
      // Wait for the scheduler to pick up PENDING instances (runs every 30s),
      // then refresh the page to show updated statuses.
      if (result.queued > 0) {
        setTimeout(() => router.refresh(), 5000);
      }
    } catch {
      // Error handling — just reset
    } finally {
      setReconciling(false);
    }
  }

  // Lazy-load agent cards when Profiles tab is activated
  useEffect(() => {
    if (activeTab !== "profiles") return;
    if (profilesFetched || loadingProfiles) return;
    if (!fleet.instances || fleet.instances.length === 0) return;

    setLoadingProfiles(true);

    Promise.allSettled(
      fleet.instances.map((instance) => api.getAgentCard(instance.id))
    ).then((results) => {
      const botProfiles: BotProfile[] = fleet.instances!.map((instance, i) => {
        const result = results[i];
        return {
          instanceId: instance.id,
          instanceName: instance.name,
          status: instance.status,
          card: result?.status === "fulfilled" ? result.value : null,
          error: result?.status === "rejected" ? (result.reason?.message || "Failed to load") : null,
        };
      });
      setProfiles(botProfiles);
      setProfilesFetched(true);
      setLoadingProfiles(false);
    });
  }, [activeTab, fleet.instances, profilesFetched, loadingProfiles]);

  const instances = fleet.instances || [];

  return (
    <Tabs defaultValue="instances" className="w-full">
      <TabsList>
        <TabsTrigger active={activeTab === "instances"} onClick={() => setActiveTab("instances")}>
          Instances
        </TabsTrigger>
        <TabsTrigger active={activeTab === "profiles"} onClick={() => setActiveTab("profiles")}>
          Profiles
        </TabsTrigger>
      </TabsList>

      {/* Instances Tab */}
      <TabsContent active={activeTab === "instances"} className="mt-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Bot Instances</CardTitle>
              <CardDescription>All instances in this fleet</CardDescription>
            </div>
            {instances.length > 0 && (
              <div className="flex items-center gap-2">
                {reconcileResult && (
                  <span className="text-xs text-muted-foreground">
                    {reconcileResult.queued} queued{reconcileResult.skipped > 0 ? `, ${reconcileResult.skipped} skipped` : ""}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReconcileAll}
                  disabled={reconciling}
                >
                  {reconciling ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Reconcile All
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Uptime</TableHead>
                  <TableHead>Last Health Check</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No instances in this fleet.
                      <Link href={`/bots/new?fleetId=${fleet.id}`}>
                        <Button variant="link" className="ml-2">Create instance</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ) : (
                  instances.map((instance: BotInstance) => (
                    <TableRow key={instance.id}>
                      <TableCell className="font-medium">
                        <Link href={`/bots/${instance.id}`} className="hover:underline">
                          {instance.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={instance.status} />
                      </TableCell>
                      <TableCell>
                        <HealthIndicator health={instance.health} />
                      </TableCell>
                      <TableCell>
                        {instance.deploymentType ? (
                          <Badge variant="outline" className="text-xs">
                            {instance.deploymentType}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">local</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${instance.status === "RUNNING" ? "bg-green-500" : "bg-gray-400"}`} />
                          <span className="text-xs font-mono">
                            {instance.gatewayConnection
                              ? `${instance.gatewayConnection.host}:${instance.gatewayConnection.port}`
                              : `localhost:${instance.gatewayPort || 18789}`}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const s = instance.runningSince
                            ? Math.max(0, Math.floor((Date.now() - new Date(instance.runningSince).getTime()) / 1000))
                            : 0;
                          return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
                        })()}
                      </TableCell>
                      <TableCell>
                        {instance.lastHealthCheckAt ? (
                          <TimeDisplay date={instance.lastHealthCheckAt} />
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link href={`/bots/${instance.id}`}>
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

      {/* Profiles Tab */}
      <TabsContent active={activeTab === "profiles"} className="mt-6">
        {loadingProfiles ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading bot profiles...</span>
          </div>
        ) : instances.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8 text-muted-foreground">
                <Bot className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No bot instances in this fleet</p>
                <p className="text-sm mt-1">Deploy a bot to see its profile here.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {profiles.map((profile) => (
              <Card key={profile.instanceId} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {profile.card?.name || profile.instanceName}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">{profile.instanceName}</p>
                      </div>
                    </div>
                    <StatusBadge status={profile.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {profile.error ? (
                    <p className="text-sm text-muted-foreground italic">
                      Could not load profile: {profile.error}
                    </p>
                  ) : profile.card ? (
                    <>
                      {/* Description */}
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {profile.card.description || "No description available."}
                      </p>

                      {/* Skills */}
                      {profile.card.skills.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Skills
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {profile.card.skills.map((skill) => (
                              <Badge key={skill.id} variant="secondary" className="text-xs">
                                {skill.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Channels / Input-Output Modes */}
                      {(profile.card.defaultInputModes.length > 0 || profile.card.defaultOutputModes.length > 0) && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Channels
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[...new Set([...profile.card.defaultInputModes, ...profile.card.defaultOutputModes])].map((mode) => (
                              <Badge key={mode} variant="outline" className="text-xs">
                                {mode}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Profile not available.
                    </p>
                  )}

                  {/* View bot link */}
                  <div className="pt-1">
                    <Link href={`/bots/${profile.instanceId}`}>
                      <Button variant="ghost" size="sm" className="text-xs px-0 h-auto text-primary hover:text-primary/80">
                        View full details &rarr;
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
