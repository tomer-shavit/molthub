"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Container, Cloud } from "lucide-react";

interface DeploymentStepProps {
  selectedTarget: "docker" | "ecs-fargate" | null;
  targetConfig: Record<string, unknown>;
  onTargetSelect: (type: string) => void;
  onConfigChange: (config: Record<string, unknown>) => void;
}

const AWS_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "EU (Ireland)" },
  { value: "eu-central-1", label: "EU (Frankfurt)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
];

export function DeploymentStep({
  selectedTarget,
  targetConfig,
  onTargetSelect,
  onConfigChange,
}: DeploymentStepProps) {
  const updateConfig = (key: string, value: string) => {
    onConfigChange({ ...targetConfig, [key]: value });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Docker */}
      <Card
        className={cn(
          "cursor-pointer transition-all hover:shadow-md",
          selectedTarget === "docker" && "border-primary ring-2 ring-primary/20"
        )}
        onClick={() => onTargetSelect("docker")}
      >
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Container className="w-5 h-5" />
            Docker
          </CardTitle>
          <CardDescription>Local or self-hosted deployment</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Docker must be installed on the target machine. Moltbot will run as a container.
          </p>
        </CardContent>
      </Card>

      {/* ECS Fargate */}
      <Card
        className={cn(
          "cursor-pointer transition-all hover:shadow-md",
          selectedTarget === "ecs-fargate" && "border-primary ring-2 ring-primary/20"
        )}
        onClick={() => onTargetSelect("ecs-fargate")}
      >
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cloud className="w-5 h-5" />
            ECS Fargate
          </CardTitle>
          <CardDescription>AWS managed containers</CardDescription>
        </CardHeader>
        <CardContent>
          {selectedTarget === "ecs-fargate" ? (
            <div
              className="space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium">AWS Region</label>
                <Select
                  value={(targetConfig.region as string) || ""}
                  onChange={(e) => updateConfig("region", e.target.value)}
                >
                  <option value="" disabled>
                    Select a region
                  </option>
                  {AWS_REGIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label} ({r.value})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">AWS Access Key ID</label>
                <Input
                  type="text"
                  placeholder="AKIA..."
                  value={(targetConfig.accessKeyId as string) || ""}
                  onChange={(e) => updateConfig("accessKeyId", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">AWS Secret Access Key</label>
                <Input
                  type="password"
                  placeholder="Secret access key"
                  value={(targetConfig.secretAccessKey as string) || ""}
                  onChange={(e) => updateConfig("secretAccessKey", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Subnet IDs</label>
                <Input
                  type="text"
                  placeholder="subnet-abc123, subnet-def456"
                  value={(targetConfig.subnetIds as string) || ""}
                  onChange={(e) => updateConfig("subnetIds", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of subnet IDs for Fargate tasks
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Security Group ID</label>
                <Input
                  type="text"
                  placeholder="sg-abc123"
                  value={(targetConfig.securityGroupId as string) || ""}
                  onChange={(e) => updateConfig("securityGroupId", e.target.value)}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Deploy to AWS ECS Fargate for a fully managed, serverless container experience. Requires AWS credentials.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
