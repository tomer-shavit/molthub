"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitBranch, ChevronDown, ChevronUp, RefreshCw, Clock } from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";

export interface EvolutionBannerData {
  hasEvolved: boolean;
  totalChanges: number;
  capturedAt?: string | null;
  gatewayReachable: boolean;
  diff?: {
    changes: Array<{
      category: string;
      field: string;
      changeType: string;
    }>;
  } | null;
  liveSkills?: string[];
  liveMcpServers?: string[];
  liveChannels?: string[];
}

interface EvolutionBannerProps {
  evolution: EvolutionBannerData | null;
  onSync: () => void;
  isSyncing: boolean;
}

export function EvolutionBanner({ evolution, onSync, isSyncing }: EvolutionBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!evolution || !evolution.hasEvolved) {
    return null;
  }

  const categoryCounts = (evolution.diff?.changes || []).reduce(
    (acc, change) => {
      acc[change.category] = (acc[change.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const summaryParts = Object.entries(categoryCounts).map(
    ([cat, count]) => `${count} ${cat}`,
  );

  const syncLabel = evolution.capturedAt ? formatTimeAgo(evolution.capturedAt) : null;

  return (
    <Card className="border-blue-200 bg-blue-50/50 mb-6">
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <GitBranch className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-blue-900">
                This agent has evolved since deployment
              </p>
              <p className="text-sm text-blue-700">
                {summaryParts.length > 0
                  ? summaryParts.join(", ") + ` — ${evolution.totalChanges} total change${evolution.totalChanges !== 1 ? "s" : ""}`
                  : `${evolution.totalChanges} change${evolution.totalChanges !== 1 ? "s" : ""} detected`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {syncLabel && (
              <span className="text-xs text-blue-600 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Synced {syncLabel}
              </span>
            )}
            {!evolution.gatewayReachable && (
              <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 text-xs">
                Gateway unreachable
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onSync}
              disabled={isSyncing}
              className="border-blue-300 text-blue-700 hover:bg-blue-100"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-blue-700"
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {isExpanded && evolution.diff?.changes && (
          <div className="mt-4 pt-4 border-t border-blue-200">
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {evolution.diff.changes.map((change, i) => (
                <div
                  key={`${change.category}-${change.field}-${i}`}
                  className="flex items-center gap-2 text-sm bg-white rounded px-3 py-2 border border-blue-100"
                >
                  <Badge
                    variant="outline"
                    className={
                      change.changeType === "added"
                        ? "text-green-600 border-green-300 bg-green-50"
                        : change.changeType === "removed"
                          ? "text-red-600 border-red-300 bg-red-50"
                          : "text-yellow-600 border-yellow-300 bg-yellow-50"
                    }
                  >
                    {change.changeType}
                  </Badge>
                  <span className="text-blue-900">
                    <span className="text-blue-500">{change.category}</span>
                    {" · "}
                    {change.field}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
