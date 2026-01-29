"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Shield, Box, HardDrive, Cpu } from "lucide-react";

export interface SandboxConfigData {
  mode: "off" | "non-main" | "all";
  scope?: "session" | "agent" | "shared";
  workspaceAccess: "none" | "ro" | "rw";
  docker?: {
    image?: string;
    network?: string;
    memory?: string;
    cpus?: number;
    status?: "running" | "stopped" | "error" | "not_configured";
  };
}

interface SandboxConfigProps {
  data: SandboxConfigData;
  className?: string;
}

const modeLabels: Record<string, { label: string; variant: "success" | "warning" | "secondary" }> = {
  off: { label: "Off", variant: "secondary" },
  "non-main": { label: "Non-Main Agents", variant: "warning" },
  all: { label: "All Agents", variant: "success" },
};

const accessLabels: Record<string, string> = {
  none: "No Access",
  ro: "Read Only",
  rw: "Read / Write",
};

const dockerStatusConfig: Record<string, { label: string; variant: "success" | "destructive" | "secondary" | "warning" }> = {
  running: { label: "Running", variant: "success" },
  stopped: { label: "Stopped", variant: "secondary" },
  error: { label: "Error", variant: "destructive" },
  not_configured: { label: "Not Configured", variant: "warning" },
};

export function SandboxConfig({ data, className }: SandboxConfigProps) {
  const { mode, scope, workspaceAccess, docker } = data;
  const modeConfig = modeLabels[mode] || modeLabels.off;
  const dockerStatus = docker?.status
    ? dockerStatusConfig[docker.status] || dockerStatusConfig.not_configured
    : dockerStatusConfig.not_configured;

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Sandbox
          </CardTitle>
          <Badge variant={modeConfig.variant}>{modeConfig.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Mode
            </span>
            <span className="font-medium capitalize">{mode}</span>
          </div>

          {scope && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Scope</span>
              <span className="font-medium capitalize">{scope}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" />
              Workspace Access
            </span>
            <span className="font-medium">{accessLabels[workspaceAccess] || workspaceAccess}</span>
          </div>

          {/* Docker section */}
          <div className="pt-3 border-t">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5" />
                Docker
              </span>
              <Badge variant={dockerStatus.variant} className="text-xs">
                {dockerStatus.label}
              </Badge>
            </div>

            {docker && (
              <div className="space-y-1.5 pl-5">
                {docker.image && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Image</span>
                    <span className="font-mono">{docker.image}</span>
                  </div>
                )}
                {docker.memory && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Memory</span>
                    <span className="font-mono">{docker.memory}</span>
                  </div>
                )}
                {docker.cpus && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Cpu className="w-3 h-3" /> CPUs
                    </span>
                    <span className="font-mono">{docker.cpus}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
