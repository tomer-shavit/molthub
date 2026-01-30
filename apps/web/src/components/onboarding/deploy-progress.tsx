"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Loader2,
  CheckCircle2,
  Circle,
  XCircle,
  Rocket,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";

interface DeployProgressProps {
  instanceId: string;
}

interface DeployStep {
  name: string;
  status: string;
}

interface DeployStatusResponse {
  instanceId: string;
  status: string;
  health: string;
  error?: string;
  steps: DeployStep[];
}

const DEFAULT_STEPS: DeployStep[] = [
  { name: "Creating infrastructure", status: "pending" },
  { name: "Installing Moltbot", status: "pending" },
  { name: "Applying configuration", status: "pending" },
  { name: "Starting gateway", status: "pending" },
  { name: "Running health check", status: "pending" },
];

function StepIcon({ status }: { status: string }) {
  switch (status) {
    case "in_progress":
      return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    case "completed":
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case "error":
      return <XCircle className="w-5 h-5 text-red-500" />;
    default:
      return <Circle className="w-5 h-5 text-gray-300" />;
  }
}

export function DeployProgress({ instanceId }: DeployProgressProps) {
  const [status, setStatus] = useState<DeployStatusResponse | null>(null);
  const [steps, setSteps] = useState<DeployStep[]>(DEFAULT_STEPS);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.getDeployStatus(instanceId);
      setStatus(data);
      if (data.steps && data.steps.length > 0) {
        setSteps(data.steps);
      }
      if (data.error) {
        setError(data.error);
      }
      if (data.status === "completed" || data.status === "error" || data.status === "failed") {
        setPolling(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch deployment status");
      setPolling(false);
    }
  }, [instanceId]);

  useEffect(() => {
    fetchStatus();

    if (!polling) return;

    const interval = setInterval(() => {
      fetchStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchStatus, polling]);

  const isComplete = status?.status === "completed";
  const isError = status?.status === "error" || status?.status === "failed";

  const handleRetry = () => {
    setError(null);
    setPolling(true);
    setSteps(DEFAULT_STEPS);
    setStatus(null);
    fetchStatus();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="w-5 h-5" />
            Deploying Your Moltbot
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {steps.map((step, index) => (
              <div key={step.name} className="flex items-center gap-3 py-3">
                <StepIcon status={step.status} />
                <div className="flex-1">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      step.status === "pending" && "text-muted-foreground",
                      step.status === "in_progress" && "text-blue-600",
                      step.status === "completed" && "text-foreground",
                      step.status === "error" && "text-red-600"
                    )}
                  >
                    {step.name}
                  </p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {isComplete && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <div>
                <h3 className="text-lg font-semibold text-green-800">
                  Deployment Successful
                </h3>
                <p className="text-sm text-green-700 mt-1">
                  Your Moltbot instance is running and ready to use.
                </p>
              </div>
              <Link href="/">
                <Button>Go to Dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4">
              <AlertTriangle className="w-12 h-12 text-red-500" />
              <div>
                <h3 className="text-lg font-semibold text-red-800">
                  Deployment Failed
                </h3>
                <p className="text-sm text-red-700 mt-1">
                  {error || "An unexpected error occurred during deployment."}
                </p>
              </div>
              <Button variant="outline" onClick={handleRetry}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
