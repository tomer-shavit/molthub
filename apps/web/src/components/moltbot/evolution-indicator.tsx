"use client";

import { Badge } from "@/components/ui/badge";
import { GitBranch } from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";

interface EvolutionIndicatorProps {
  hasEvolved: boolean;
  totalChanges: number;
  lastSyncedAt?: string | null;
  className?: string;
}

export function EvolutionIndicator({
  hasEvolved,
  totalChanges,
  lastSyncedAt,
  className,
}: EvolutionIndicatorProps) {
  if (!hasEvolved || totalChanges === 0) {
    return null;
  }

  const syncLabel = lastSyncedAt
    ? formatTimeAgo(lastSyncedAt)
    : null;

  return (
    <div className={className} title={`${totalChanges} change${totalChanges !== 1 ? "s" : ""} since deployment${syncLabel ? ` · Last synced ${syncLabel}` : ""}`}>
      <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 gap-1 text-xs">
        <GitBranch className="w-3 h-3" />
        {totalChanges} evolved
      </Badge>
    </div>
  );
}
