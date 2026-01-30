"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TimeDisplay } from "@/components/ui/time-display";
import {
  api,
  type HealthAlert,
  type HealthAlertSeverity,
  type HealthAlertStatus,
} from "@/lib/api";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  XCircle,
  Check,
  Eye,
  EyeOff,
  Wrench,
  Clock,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

function severityColor(severity: HealthAlertSeverity): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-500 text-white";
    case "ERROR":
      return "bg-orange-500 text-white";
    case "WARNING":
      return "bg-yellow-500 text-black";
    case "INFO":
      return "bg-blue-500 text-white";
    default:
      return "bg-gray-500 text-white";
  }
}

function severityIcon(severity: HealthAlertSeverity) {
  switch (severity) {
    case "CRITICAL":
      return <XCircle className="w-4 h-4" />;
    case "ERROR":
      return <AlertCircle className="w-4 h-4" />;
    case "WARNING":
      return <AlertTriangle className="w-4 h-4" />;
    case "INFO":
      return <Info className="w-4 h-4" />;
    default:
      return <Info className="w-4 h-4" />;
  }
}

function statusBadgeVariant(
  status: HealthAlertStatus,
): "destructive" | "warning" | "success" | "secondary" {
  switch (status) {
    case "ACTIVE":
      return "destructive";
    case "ACKNOWLEDGED":
      return "warning";
    case "RESOLVED":
      return "success";
    case "SUPPRESSED":
      return "secondary";
    default:
      return "secondary";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AlertCardProps {
  alert: HealthAlert;
  onUpdate?: () => void;
}

export function AlertCard({ alert, onUpdate }: AlertCardProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (
    action: "acknowledge" | "resolve" | "suppress" | "remediate",
  ) => {
    setLoading(action);
    try {
      switch (action) {
        case "acknowledge":
          await api.acknowledgeAlert(alert.id);
          break;
        case "resolve":
          await api.resolveAlert(alert.id);
          break;
        case "suppress":
          await api.suppressAlert(alert.id);
          break;
        case "remediate":
          await api.remediateAlert(alert.id);
          break;
      }
      onUpdate?.();
    } catch (err) {
      console.error(`Failed to ${action} alert:`, err);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${severityColor(alert.severity)}`}
            >
              {severityIcon(alert.severity)}
              {alert.severity}
            </span>
            <Badge variant={statusBadgeVariant(alert.status)}>
              {alert.status}
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
            <Clock className="w-3 h-3" />
            <TimeDisplay date={alert.lastTriggeredAt} format="absolute" />
          </div>
        </div>
        <CardTitle className="text-base mt-2">{alert.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{alert.message}</p>

        {alert.detail && (
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
              Details
            </summary>
            <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
              {alert.detail}
            </pre>
          </details>
        )}

        {/* Instance / Fleet info */}
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {alert.instance && (
            <span className="px-2 py-0.5 bg-secondary rounded">
              Instance: {alert.instance.name}
            </span>
          )}
          {alert.fleet && (
            <span className="px-2 py-0.5 bg-secondary rounded">
              Fleet: {alert.fleet.name}
            </span>
          )}
          <span className="px-2 py-0.5 bg-secondary rounded">
            Rule: {alert.rule}
          </span>
          {alert.consecutiveHits > 1 && (
            <span className="px-2 py-0.5 bg-secondary rounded">
              Hits: {alert.consecutiveHits}
            </span>
          )}
        </div>

        {/* Timestamps */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>
            First triggered:{" "}
            <TimeDisplay date={alert.firstTriggeredAt} format="absolute" />
          </span>
          {alert.acknowledgedAt && (
            <span>
              Acknowledged:{" "}
              <TimeDisplay date={alert.acknowledgedAt} format="absolute" />
              {alert.acknowledgedBy ? ` by ${alert.acknowledgedBy}` : ""}
            </span>
          )}
          {alert.resolvedAt && (
            <span>
              Resolved:{" "}
              <TimeDisplay date={alert.resolvedAt} format="absolute" />
            </span>
          )}
        </div>

        {/* Remediation note */}
        {alert.remediationNote && (
          <div className="text-xs p-2 bg-muted rounded">
            <span className="font-medium">Remediation note:</span>{" "}
            {alert.remediationNote}
          </div>
        )}

        {/* Action buttons */}
        {alert.status === "ACTIVE" && (
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              disabled={loading !== null}
              onClick={() => handleAction("acknowledge")}
            >
              <Eye className="w-3 h-3 mr-1" />
              {loading === "acknowledge" ? "..." : "Acknowledge"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading !== null}
              onClick={() => handleAction("resolve")}
            >
              <Check className="w-3 h-3 mr-1" />
              {loading === "resolve" ? "..." : "Resolve"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading !== null}
              onClick={() => handleAction("suppress")}
            >
              <EyeOff className="w-3 h-3 mr-1" />
              {loading === "suppress" ? "..." : "Suppress"}
            </Button>
            {alert.remediationAction && (
              <Button
                variant="default"
                size="sm"
                disabled={loading !== null}
                onClick={() => handleAction("remediate")}
              >
                <Wrench className="w-3 h-3 mr-1" />
                {loading === "remediate"
                  ? "Running..."
                  : `Remediate (${alert.remediationAction})`}
              </Button>
            )}
          </div>
        )}

        {alert.status === "ACKNOWLEDGED" && (
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              disabled={loading !== null}
              onClick={() => handleAction("resolve")}
            >
              <Check className="w-3 h-3 mr-1" />
              {loading === "resolve" ? "..." : "Resolve"}
            </Button>
            {alert.remediationAction && (
              <Button
                variant="default"
                size="sm"
                disabled={loading !== null}
                onClick={() => handleAction("remediate")}
              >
                <Wrench className="w-3 h-3 mr-1" />
                {loading === "remediate"
                  ? "Running..."
                  : `Remediate (${alert.remediationAction})`}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
