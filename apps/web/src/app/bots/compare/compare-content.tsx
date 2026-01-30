"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, BotInstance } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

function getStatusColor(status: string): "default" | "success" | "warning" | "destructive" | "secondary" {
  switch (status) {
    case "RUNNING":
      return "success";
    case "PAUSED":
    case "DEGRADED":
      return "warning";
    case "ERROR":
    case "DELETING":
      return "destructive";
    case "CREATING":
    case "PENDING":
    case "RECONCILING":
      return "secondary";
    default:
      return "default";
  }
}

function getHealthColor(health: string): "success" | "warning" | "destructive" | "secondary" {
  switch (health) {
    case "HEALTHY":
      return "success";
    case "DEGRADED":
      return "warning";
    case "UNHEALTHY":
      return "destructive";
    default:
      return "secondary";
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export default function ComparePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [instances, setInstances] = useState<BotInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const idsParam = searchParams.get("ids");
    if (!idsParam) {
      setError("No bot IDs provided. Use ?ids=id1,id2,id3");
      setLoading(false);
      return;
    }

    const ids = idsParam.split(",").filter(Boolean);
    if (ids.length < 2) {
      setError("At least 2 bot IDs are required for comparison.");
      setLoading(false);
      return;
    }
    if (ids.length > 4) {
      setError("Maximum 4 bot IDs can be compared at once.");
      setLoading(false);
      return;
    }

    api
      .compareBots(ids)
      .then((data) => {
        setInstances(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to fetch bots.");
        setLoading(false);
      });
  }, [searchParams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        Loading comparison data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => router.push("/bots")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Bots
        </Button>
        <div className="text-sm text-red-600 bg-red-50 p-4 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bot Comparison</h1>
          <p className="text-muted-foreground">
            Comparing {instances.length} bot instances side by side
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/bots")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Bots
        </Button>
      </div>

      <div className={`grid gap-4 ${instances.length <= 2 ? "grid-cols-1 md:grid-cols-2" : instances.length === 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"}`}>
        {instances.map((instance) => (
          <Card key={instance.id} className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-base truncate">{instance.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              {/* Status & Health */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={getStatusColor(instance.status)}>
                    {instance.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Health</span>
                  <Badge variant={getHealthColor(instance.health)}>
                    {instance.health}
                  </Badge>
                </div>
              </div>

              {/* Deployment Info */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Deployment</span>
                  <span className="font-mono text-xs">
                    {instance.deploymentType || "N/A"}
                  </span>
                </div>
                {instance.gatewayPort && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Gateway Port</span>
                    <span className="font-mono text-xs">{instance.gatewayPort}</span>
                  </div>
                )}
                {instance.moltbotVersion && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Version</span>
                    <span className="font-mono text-xs">{instance.moltbotVersion}</span>
                  </div>
                )}
              </div>

              {/* Metrics */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Uptime</span>
                  <span className="font-mono text-xs">
                    {formatUptime(instance.uptimeSeconds)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Restarts</span>
                  <span className={`font-mono text-xs ${instance.restartCount > 0 ? "text-orange-600" : ""}`}>
                    {instance.restartCount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Errors</span>
                  <span className={`font-mono text-xs ${instance.errorCount > 0 ? "text-red-600" : ""}`}>
                    {instance.errorCount}
                  </span>
                </div>
              </div>

              {/* Config Hash */}
              {instance.configHash && (
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Config Hash</span>
                    <span className="font-mono text-xs truncate max-w-[120px]">
                      {instance.configHash}
                    </span>
                  </div>
                </div>
              )}

              {/* Tags */}
              {Object.keys(instance.tags).length > 0 && (
                <div className="pt-2 border-t">
                  <span className="text-sm text-muted-foreground block mb-1">Tags</span>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(instance.tags).map(([key, value]) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {key}: {value}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* View Details */}
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => router.push(`/bots/${instance.id}`)}
                >
                  View Details
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
