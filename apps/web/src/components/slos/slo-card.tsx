"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SloDefinition } from "@/lib/api";

const METRIC_LABELS: Record<string, string> = {
  UPTIME: "Uptime",
  LATENCY_P50: "Latency P50",
  LATENCY_P95: "Latency P95",
  LATENCY_P99: "Latency P99",
  ERROR_RATE: "Error Rate",
  CHANNEL_HEALTH: "Channel Health",
};

const WINDOW_LABELS: Record<string, string> = {
  ROLLING_1H: "1 Hour",
  ROLLING_24H: "24 Hours",
  ROLLING_7D: "7 Days",
  ROLLING_30D: "30 Days",
  CALENDAR_DAY: "Calendar Day",
  CALENDAR_WEEK: "Calendar Week",
  CALENDAR_MONTH: "Calendar Month",
};

function getMetricUnit(metric: string): string {
  switch (metric) {
    case "UPTIME":
    case "ERROR_RATE":
    case "CHANNEL_HEALTH":
      return "%";
    case "LATENCY_P50":
    case "LATENCY_P95":
    case "LATENCY_P99":
      return "ms";
    default:
      return "";
  }
}

function getStatusInfo(slo: SloDefinition): {
  variant: "success" | "destructive" | "warning";
  label: string;
} {
  if (slo.isBreached) {
    return { variant: "destructive", label: "Breached" };
  }

  // Check if close to breach (>90% of target for "higher is better" metrics)
  if (slo.currentValue !== undefined && slo.currentValue !== null) {
    const metric = slo.metric;
    const isHigherBetter =
      metric === "UPTIME" || metric === "CHANNEL_HEALTH";
    const isLowerBetter =
      metric === "LATENCY_P50" ||
      metric === "LATENCY_P95" ||
      metric === "LATENCY_P99" ||
      metric === "ERROR_RATE";

    if (isHigherBetter) {
      // current should be >= target; close to breach if current < target * 1.1
      const threshold = slo.targetValue * 0.9;
      if (slo.currentValue < slo.targetValue * 1.1 && slo.currentValue >= threshold) {
        return { variant: "warning", label: "At Risk" };
      }
    } else if (isLowerBetter) {
      // current should be <= target; close to breach if current > target * 0.9
      const threshold = slo.targetValue * 0.9;
      if (slo.currentValue > threshold && slo.currentValue <= slo.targetValue) {
        return { variant: "warning", label: "At Risk" };
      }
    }
  }

  return { variant: "success", label: "Healthy" };
}

interface SloCardProps {
  slo: SloDefinition;
  onDelete?: (id: string) => void;
}

export function SloCard({ slo }: SloCardProps) {
  const statusInfo = getStatusInfo(slo);
  const unit = getMetricUnit(slo.metric);
  const currentDisplay =
    slo.currentValue !== undefined && slo.currentValue !== null
      ? `${slo.currentValue.toFixed(2)}${unit}`
      : "N/A";
  const targetDisplay = `${slo.targetValue}${unit}`;

  return (
    <Card className={slo.isBreached ? "border-red-300 dark:border-red-800" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{slo.name}</CardTitle>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </div>
        {slo.description && (
          <p className="text-sm text-muted-foreground">{slo.description}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Metric</span>
            <span className="font-medium">
              {METRIC_LABELS[slo.metric] || slo.metric}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Target</span>
            <span className="font-medium">{targetDisplay}</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Current</span>
            <span
              className={`font-medium ${
                slo.isBreached
                  ? "text-red-600 dark:text-red-400"
                  : statusInfo.variant === "warning"
                    ? "text-yellow-600 dark:text-yellow-400"
                    : "text-green-600 dark:text-green-400"
              }`}
            >
              {currentDisplay}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Window</span>
            <span className="font-medium">
              {WINDOW_LABELS[slo.window] || slo.window}
            </span>
          </div>

          {slo.instance && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Instance</span>
              <span className="font-medium">{slo.instance.name}</span>
            </div>
          )}

          {slo.breachCount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Breach Count</span>
              <span className="font-medium text-red-600 dark:text-red-400">
                {slo.breachCount}
              </span>
            </div>
          )}

          {!slo.isActive && (
            <Badge variant="secondary" className="mt-2">
              Inactive
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
