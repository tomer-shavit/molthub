"use client";

import { useEffect, useState } from "react";
import {
  Check,
  X,
  Loader2,
  Clock,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useProvisioningEvents,
  type ProvisioningProgress,
} from "@/hooks/use-provisioning-events";
import { StepProgress } from "./step-progress";
import { DeployTerminal } from "./deploy-terminal";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProvisioningScreenProps {
  instanceId: string;
  instanceName?: string;
  onRetry?: () => void;
  onViewBot?: () => void;
  onViewLogs?: () => void;
  onViewDiagnostics?: () => void;
}

// ---------------------------------------------------------------------------
// Elapsed timer sub-component
// ---------------------------------------------------------------------------

function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState("0s");

  useEffect(() => {
    const update = () => {
      const start = new Date(startedAt).getTime();
      const diff = Math.floor((Date.now() - start) / 1000);
      if (diff < 60) {
        setElapsed(`${diff}s`);
      } else {
        const m = Math.floor(diff / 60);
        const s = diff % 60;
        setElapsed(`${m}m ${s}s`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      {elapsed}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Connection status badge
// ---------------------------------------------------------------------------

function ConnectionBadge({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
        <Wifi className="h-3 w-3" />
        Live
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-xs text-yellow-700">
      <WifiOff className="h-3 w-3" />
      Polling
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProvisioningScreen({
  instanceId,
  instanceName,
  onRetry,
  onViewBot,
  onViewLogs,
  onViewDiagnostics,
}: ProvisioningScreenProps) {
  const { progress, isConnected, logs } = useProvisioningEvents(instanceId);

  const title = instanceName
    ? `Deploying ${instanceName}`
    : "Deploying your bot";

  // ---- In-progress state ----
  if (!progress || progress.status === "in_progress") {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              {title}
            </CardTitle>
            <div className="flex items-center gap-2">
              {progress?.startedAt && (
                <ElapsedTimer startedAt={progress.startedAt} />
              )}
              <ConnectionBadge connected={isConnected} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            This usually takes 5–10 minutes. Subsequent deploys in the same region are faster.
          </p>
        </CardHeader>
        <CardContent>
          {progress ? (
            <>
              <div className="space-y-0">
                {progress.steps.map((step, i) => (
                  <StepProgress
                    key={step.id}
                    step={step}
                    isLast={i === progress.steps.length - 1}
                  />
                ))}
              </div>
              <DeployTerminal logs={logs} status={progress?.status} />
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Connecting to provisioning service...
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---- Completed state ----
  if (progress.status === "completed") {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-green-700">
            <Check className="h-5 w-5" />
            Deployment complete
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {progress.steps.map((step, i) => (
              <StepProgress
                key={step.id}
                step={step}
                isLast={i === progress.steps.length - 1}
              />
            ))}
          </div>
          <DeployTerminal logs={logs} defaultExpanded={false} status="completed" />
          {onViewBot && (
            <div className="mt-4 flex justify-center">
              <Button onClick={onViewBot}>
                <ExternalLink className="mr-2 h-4 w-4" />
                View Bot
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---- Error state ----
  if (progress.status === "error") {
    return (
      <Card className="mx-auto max-w-2xl border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-red-700">
            <X className="h-5 w-5" />
            Deployment failed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {progress.steps.map((step, i) => (
              <StepProgress
                key={step.id}
                step={step}
                isLast={i === progress.steps.length - 1}
              />
            ))}
          </div>
          <DeployTerminal logs={logs} autoExpandOnError={true} status="error" />
          {progress.error && (
            <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {progress.error}
            </div>
          )}
          <div className="mt-4 flex justify-center gap-2">
            {onRetry && (
              <Button variant="outline" onClick={onRetry}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            )}
            {onViewLogs && (
              <Button variant="outline" onClick={onViewLogs}>
                View Logs
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Timeout state ----
  return (
    <Card className="mx-auto max-w-2xl border-yellow-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-yellow-700">
          <AlertTriangle className="h-5 w-5" />
          Deployment timed out
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {progress.steps.map((step, i) => (
            <StepProgress
              key={step.id}
              step={step}
              isLast={i === progress.steps.length - 1}
            />
          ))}
        </div>
        <DeployTerminal logs={logs} status="timeout" />
        <div className="mt-3 rounded-md bg-yellow-50 p-3 text-sm text-yellow-700">
          The deployment is taking longer than expected. Your bot may still be
          starting up.
        </div>
        <div className="mt-4 flex justify-center gap-2">
          {onRetry && (
            <Button variant="outline" onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}
          {onViewDiagnostics && (
            <Button variant="outline" onClick={onViewDiagnostics}>
              View Diagnostics
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
