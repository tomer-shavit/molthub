"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface DeployStep {
  name: string;
  status: "pending" | "in_progress" | "completed" | "failed";
}

interface DeployStatus {
  instanceId: string;
  status: string;
  health: string;
  error?: string;
  steps: DeployStep[];
}

interface DeployProgressProps {
  instanceId: string;
}

export function DeployProgress({ instanceId }: DeployProgressProps) {
  const [status, setStatus] = useState<DeployStatus | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await api.getDeployStatus(instanceId);
        setStatus(res as DeployStatus);
      } catch {
        // ignore polling errors
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [instanceId]);

  if (!status) {
    return <div className="text-center py-8 text-muted-foreground">Loading deployment status...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {status.steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                step.status === "completed"
                  ? "bg-green-100 text-green-700"
                  : step.status === "in_progress"
                  ? "bg-blue-100 text-blue-700 animate-pulse"
                  : step.status === "failed"
                  ? "bg-red-100 text-red-700"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step.status === "completed" ? "\u2713" : i + 1}
            </div>
            <span
              className={
                step.status === "completed"
                  ? "text-foreground"
                  : step.status === "in_progress"
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              }
            >
              {step.name}
            </span>
          </div>
        ))}
      </div>
      {status.error && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
          {status.error}
        </div>
      )}
    </div>
  );
}
