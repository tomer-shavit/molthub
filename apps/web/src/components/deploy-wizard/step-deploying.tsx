"use client";

import { useState, useEffect, useRef } from "react";
import { ProvisioningScreen } from "@/components/provisioning/provisioning-screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  MessageSquare,
  LayoutDashboard,
  Plus,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Info,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";

interface StepDeployingProps {
  instanceId: string;
  botName: string;
  onRetryDeploy?: () => void;
}

export function StepDeploying({ instanceId, botName, onRetryDeploy }: StepDeployingProps) {
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<string | null>(null);
  const [isSlow, setIsSlow] = useState(false);
  const startTimeRef = useRef(Date.now());

  // Reset state when instanceId changes (e.g., retry creates a new instance)
  useEffect(() => {
    startTimeRef.current = Date.now();
    setIsSlow(false);
    setPollError(null);
    setPollStatus(null);
  }, [instanceId]);

  // Polling fallback: poll deploy status endpoint every 5s for error detection
  useEffect(() => {
    const SLOW_THRESHOLD_MS = 7 * 60 * 1000; // 7 minutes

    const interval = setInterval(async () => {
      // Check if deployment is taking too long
      if (Date.now() - startTimeRef.current > SLOW_THRESHOLD_MS) {
        setIsSlow(true);
      }

      try {
        const status = await api.getDeployStatus(instanceId);
        if (status.status === "ERROR" || status.error) {
          setPollError(status.error || "Deployment failed. Check API logs for details.");
          setPollStatus("ERROR");
          clearInterval(interval);
        } else if (status.status === "RUNNING") {
          setPollStatus("RUNNING");
          clearInterval(interval);
        }
      } catch {
        // Polling error — continue silently
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [instanceId]);

  const isComplete = pollStatus === "RUNNING";
  const isError = pollStatus === "ERROR";
  const isTimeout = pollStatus === "TIMEOUT";

  if (isComplete) {
    return (
      <div className="space-y-8 text-center">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold">Your OpenClaw agent is live!</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            <strong>{botName}</strong> is running and ready. Here&apos;s what you can do next.
          </p>
        </div>

        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-800 max-w-lg mx-auto">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            If you configured WhatsApp, you&apos;ll need to complete QR pairing from the Dashboard &rarr; Channels tab to start receiving messages.
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3 max-w-2xl mx-auto">
          <Link href={`/bots/${instanceId}`}>
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardContent className="pt-6 text-center space-y-2">
                <LayoutDashboard className="w-6 h-6 mx-auto text-primary" />
                <p className="font-medium text-sm">Go to Dashboard</p>
                <p className="text-xs text-muted-foreground">View your agent&apos;s status and health</p>
              </CardContent>
            </Card>
          </Link>
          <Link href={`/channels`}>
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardContent className="pt-6 text-center space-y-2">
                <MessageSquare className="w-6 h-6 mx-auto text-primary" />
                <p className="font-medium text-sm">Add a Channel</p>
                <p className="text-xs text-muted-foreground">Connect WhatsApp, Telegram, or Discord</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/bots/new">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardContent className="pt-6 text-center space-y-2">
                <Plus className="w-6 h-6 mx-auto text-primary" />
                <p className="font-medium text-sm">Deploy Another Bot</p>
                <p className="text-xs text-muted-foreground">Create another agent for a different task</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    );
  }

  if (isError || isTimeout) {
    const errorMessage = pollError || (isTimeout
      ? "The deployment is taking longer than expected. Your bot may still be starting up."
      : "Something went wrong while deploying your agent.");

    return (
      <div className="space-y-6 text-center">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold">
            {isTimeout ? "Deployment timed out" : "Deployment failed"}
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            {errorMessage}
          </p>
        </div>
        <div className="rounded-md bg-muted p-4 text-left max-w-md mx-auto">
          <p className="text-sm font-medium mb-2">Troubleshooting</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Check API logs: <code className="text-xs">bash scripts/setup.sh logs</code></li>
            <li>Run diagnostics: <code className="text-xs">bash scripts/setup.sh doctor</code></li>
            <li>Verify gateway: <code className="text-xs">curl http://localhost:18789</code></li>
          </ul>
        </div>
        <div className="flex justify-center gap-3">
          {onRetryDeploy && (
            <Button variant="outline" onClick={onRetryDeploy}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          )}
          <Link href="/">
            <Button variant="outline">Go to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isSlow && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <Info className="w-4 h-4 flex-shrink-0" />
          <span>Deployments can take up to 10 minutes on the first run. Your bot is still being set up.</span>
        </div>
      )}
      <ProvisioningScreen instanceId={instanceId} instanceName={botName} />
    </div>
  );
}
