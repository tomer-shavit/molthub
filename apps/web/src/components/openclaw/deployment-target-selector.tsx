"use client";

import { useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Monitor,
  Server,
  Container,
  Cloud,
  Boxes,
  Globe,
} from "lucide-react";

export type DeploymentTargetType =
  | "local"
  | "remote-vm"
  | "docker"
  | "kubernetes"
  | "ecs"
  | "gce"
  | "azure-vm";

export interface DeploymentTargetConfig {
  type: DeploymentTargetType;
  host?: string;
  port?: number;
  image?: string;
  namespace?: string;
  cluster?: string;
  region?: string;
  zone?: string;
  projectId?: string;
  serviceName?: string;
  resourceGroup?: string;
  subscriptionId?: string;
}

interface DeploymentTargetSelectorProps {
  value: DeploymentTargetConfig;
  onChange?: (config: DeploymentTargetConfig) => void;
  className?: string;
}

const targetOptions: {
  type: DeploymentTargetType;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    type: "local",
    label: "Local",
    description: "Run on the local machine",
    icon: <Monitor className="w-5 h-5" />,
  },
  {
    type: "remote-vm",
    label: "Remote VM",
    description: "SSH-accessible remote server",
    icon: <Server className="w-5 h-5" />,
  },
  {
    type: "docker",
    label: "Docker",
    description: "Docker container",
    icon: <Container className="w-5 h-5" />,
  },
  {
    type: "kubernetes",
    label: "Kubernetes",
    description: "K8s pod deployment",
    icon: <Boxes className="w-5 h-5" />,
  },
  {
    type: "ecs",
    label: "AWS ECS",
    description: "Elastic Container Service",
    icon: <Cloud className="w-5 h-5" />,
  },
  {
    type: "gce",
    label: "GCE",
    description: "Google Compute Engine VM",
    icon: <Globe className="w-5 h-5" />,
  },
  {
    type: "azure-vm",
    label: "Azure VM",
    description: "Azure Virtual Machine",
    icon: <Cloud className="w-5 h-5" />,
  },
];

export function DeploymentTargetSelector({
  value,
  onChange,
  className,
}: DeploymentTargetSelectorProps) {
  const handleTypeChange = useCallback(
    (type: DeploymentTargetType) => {
      onChange?.({ type });
    },
    [onChange]
  );

  const handleFieldChange = useCallback(
    (field: string, fieldValue: string) => {
      onChange?.({ ...value, [field]: fieldValue });
    },
    [value, onChange]
  );

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Deployment Target</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Target type cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
          {targetOptions.map((option) => (
            <button
              key={option.type}
              onClick={() => handleTypeChange(option.type)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center",
                value.type === option.type
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
              )}
            >
              {option.icon}
              <span className="text-xs font-medium">{option.label}</span>
            </button>
          ))}
        </div>

        {/* Per-type config */}
        <div className="space-y-3 pt-3 border-t">
          {value.type === "remote-vm" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Host</label>
                <Input
                  placeholder="192.168.1.100 or hostname"
                  value={value.host || ""}
                  onChange={(e) => handleFieldChange("host", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Port</label>
                <Input
                  type="number"
                  placeholder="22"
                  value={value.port || ""}
                  onChange={(e) => handleFieldChange("port", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </>
          )}

          {value.type === "docker" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Image</label>
              <Input
                placeholder="clawster/openclaw:latest"
                value={value.image || ""}
                onChange={(e) => handleFieldChange("image", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          )}

          {value.type === "kubernetes" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Namespace</label>
                <Input
                  placeholder="default"
                  value={value.namespace || ""}
                  onChange={(e) => handleFieldChange("namespace", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Image</label>
                <Input
                  placeholder="clawster/openclaw:latest"
                  value={value.image || ""}
                  onChange={(e) => handleFieldChange("image", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </>
          )}

          {value.type === "ecs" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Cluster ARN</label>
                <Input
                  placeholder="arn:aws:ecs:us-east-1:..."
                  value={value.cluster || ""}
                  onChange={(e) => handleFieldChange("cluster", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Service Name</label>
                <Input
                  placeholder="my-bot-service"
                  value={value.serviceName || ""}
                  onChange={(e) => handleFieldChange("serviceName", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Region</label>
                <Input
                  placeholder="us-east-1"
                  value={value.region || ""}
                  onChange={(e) => handleFieldChange("region", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </>
          )}

          {value.type === "gce" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Project ID</label>
                <Input
                  placeholder="my-gcp-project"
                  value={value.projectId || ""}
                  onChange={(e) => handleFieldChange("projectId", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Zone</label>
                <Input
                  placeholder="us-central1-a"
                  value={value.zone || ""}
                  onChange={(e) => handleFieldChange("zone", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Instance Name</label>
                <Input
                  placeholder="my-bot-instance"
                  value={value.serviceName || ""}
                  onChange={(e) => handleFieldChange("serviceName", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Image</label>
                <Input
                  placeholder="node:22-slim"
                  value={value.image || ""}
                  onChange={(e) => handleFieldChange("image", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </>
          )}

          {value.type === "azure-vm" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Subscription ID</label>
                <Input
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={value.subscriptionId || ""}
                  onChange={(e) => handleFieldChange("subscriptionId", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Resource Group</label>
                <Input
                  placeholder="my-resource-group"
                  value={value.resourceGroup || ""}
                  onChange={(e) => handleFieldChange("resourceGroup", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Region</label>
                <Input
                  placeholder="eastus"
                  value={value.region || ""}
                  onChange={(e) => handleFieldChange("region", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">VM Name</label>
                <Input
                  placeholder="my-bot-vm"
                  value={value.serviceName || ""}
                  onChange={(e) => handleFieldChange("serviceName", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Image</label>
                <Input
                  placeholder="node:22-slim"
                  value={value.image || ""}
                  onChange={(e) => handleFieldChange("image", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </>
          )}

          {value.type === "local" && (
            <p className="text-sm text-muted-foreground">
              The bot will run on the local machine. No additional configuration needed.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
