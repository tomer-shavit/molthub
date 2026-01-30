"use client";

import { useState } from "react";
import { useProvisioningEvents } from "@/hooks/use-provisioning-events";
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
} from "lucide-react";
import Link from "next/link";

interface StepDeployingProps {
  instanceId: string;
  botName: string;
  onRetryDeploy?: () => void;
}

export function StepDeploying({ instanceId, botName, onRetryDeploy }: StepDeployingProps) {
  const { progress } = useProvisioningEvents(instanceId);

  const isComplete = progress?.status === "completed";
  const isError = progress?.status === "error";
  const isTimeout = progress?.status === "timeout";

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
            {progress?.error || (isTimeout
              ? "The deployment is taking longer than expected. Your bot may still be starting up."
              : "Something went wrong while deploying your agent.")}
          </p>
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
      <ProvisioningScreen instanceId={instanceId} instanceName={botName} />
    </div>
  );
}
