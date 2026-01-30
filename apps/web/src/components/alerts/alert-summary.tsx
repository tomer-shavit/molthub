"use client";

import type { AlertSummary } from "@/lib/api";
import { AlertTriangle, AlertCircle, XCircle, Info } from "lucide-react";

// ---------------------------------------------------------------------------
// Severity pill helpers
// ---------------------------------------------------------------------------

interface SeverityPillConfig {
  label: string;
  bgColor: string;
  textColor: string;
  icon: React.ReactNode;
}

const SEVERITY_CONFIG: Record<string, SeverityPillConfig> = {
  CRITICAL: {
    label: "Critical",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    textColor: "text-red-700 dark:text-red-400",
    icon: <XCircle className="w-4 h-4" />,
  },
  ERROR: {
    label: "Error",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    textColor: "text-orange-700 dark:text-orange-400",
    icon: <AlertCircle className="w-4 h-4" />,
  },
  WARNING: {
    label: "Warning",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    textColor: "text-yellow-700 dark:text-yellow-400",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  INFO: {
    label: "Info",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    textColor: "text-blue-700 dark:text-blue-400",
    icon: <Info className="w-4 h-4" />,
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AlertSummaryBarProps {
  summary: AlertSummary;
}

export function AlertSummaryBar({ summary }: AlertSummaryBarProps) {
  const severityOrder = ["CRITICAL", "ERROR", "WARNING", "INFO"];

  return (
    <div className="flex flex-wrap gap-3">
      {severityOrder.map((sev) => {
        const config = SEVERITY_CONFIG[sev];
        const count = summary.bySeverity[sev] ?? 0;

        if (!config) return null;

        return (
          <div
            key={sev}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${config.bgColor} ${config.textColor}`}
          >
            {config.icon}
            <span>{config.label}</span>
            <span className="font-bold">{count}</span>
          </div>
        );
      })}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
        Total active
        <span className="font-bold">{summary.total}</span>
      </div>
    </div>
  );
}
