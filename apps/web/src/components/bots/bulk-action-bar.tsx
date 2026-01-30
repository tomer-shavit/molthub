"use client";

import { useState } from "react";
import { api, BulkActionResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RotateCcw,
  Pause,
  Square,
  Play,
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";

interface BulkActionBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onActionComplete?: () => void;
}

type ActionType = "restart" | "pause" | "stop" | "start";

export function BulkActionBar({
  selectedIds,
  onClearSelection,
  onActionComplete,
}: BulkActionBarProps) {
  const [confirmAction, setConfirmAction] = useState<ActionType | null>(null);
  const [executing, setExecuting] = useState(false);
  const [results, setResults] = useState<BulkActionResult[] | null>(null);

  if (selectedIds.length === 0) return null;

  const executeAction = async (action: ActionType) => {
    setExecuting(true);
    setResults(null);
    try {
      const res = await api.bulkAction({
        instanceIds: selectedIds,
        action,
      });
      setResults(res);
      setConfirmAction(null);
      onActionComplete?.();
    } catch (e) {
      setResults(
        selectedIds.map((id) => ({
          instanceId: id,
          success: false,
          error: e instanceof Error ? e.message : "Unknown error",
        }))
      );
    } finally {
      setExecuting(false);
    }
  };

  const handleAction = (action: ActionType) => {
    if (confirmAction === action) {
      executeAction(action);
    } else {
      setConfirmAction(action);
      setResults(null);
    }
  };

  const successCount = results?.filter((r) => r.success).length ?? 0;
  const failCount = results?.filter((r) => !r.success).length ?? 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* Results display */}
        {results && (
          <div className="mb-3 p-3 rounded-lg bg-muted">
            <div className="flex items-center gap-4 text-sm">
              {successCount > 0 && (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  {successCount} succeeded
                </span>
              )}
              {failCount > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <XCircle className="w-4 h-4" />
                  {failCount} failed
                </span>
              )}
            </div>
            {results
              .filter((r) => !r.success)
              .map((r) => (
                <div key={r.instanceId} className="text-xs text-red-600 mt-1">
                  {r.instanceId}: {r.error}
                </div>
              ))}
          </div>
        )}

        {/* Confirmation message */}
        {confirmAction && !executing && (
          <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-sm text-amber-800">
              Click &quot;{confirmAction}&quot; again to confirm action on {selectedIds.length} bot
              {selectedIds.length > 1 ? "s" : ""}.
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="shrink-0">
            {selectedIds.length} selected
          </Badge>

          <div className="flex items-center gap-2">
            <Button
              variant={confirmAction === "restart" ? "default" : "outline"}
              size="sm"
              onClick={() => handleAction("restart")}
              disabled={executing}
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Restart
            </Button>
            <Button
              variant={confirmAction === "pause" ? "default" : "outline"}
              size="sm"
              onClick={() => handleAction("pause")}
              disabled={executing}
            >
              <Pause className="w-4 h-4 mr-1" />
              Pause
            </Button>
            <Button
              variant={confirmAction === "stop" ? "default" : "outline"}
              size="sm"
              onClick={() => handleAction("stop")}
              disabled={executing}
            >
              <Square className="w-4 h-4 mr-1" />
              Stop
            </Button>
            <Button
              variant={confirmAction === "start" ? "default" : "outline"}
              size="sm"
              onClick={() => handleAction("start")}
              disabled={executing}
            >
              <Play className="w-4 h-4 mr-1" />
              Start
            </Button>
          </div>

          <div className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setConfirmAction(null);
                setResults(null);
                onClearSelection();
              }}
            >
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
