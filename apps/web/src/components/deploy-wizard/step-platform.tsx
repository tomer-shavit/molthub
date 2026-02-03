"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Monitor, Cloud } from "lucide-react";
import { AwsConfigPanel, AwsConfig } from "./aws-config-panel";

export type Platform = "docker" | "aws" | "azure" | "gcp";

interface PlatformOption {
  id: Platform;
  name: string;
  description: string;
  icon: React.ReactNode;
  available: boolean;
}

const PLATFORMS: PlatformOption[] = [
  {
    id: "docker",
    name: "Local / Docker",
    description: "Run on your machine with Docker. No cloud account needed.",
    icon: <Monitor className="w-6 h-6" />,
    available: true,
  },
  {
    id: "aws",
    name: "AWS",
    description: "Deploy to Amazon Web Services (ECS EC2).",
    icon: <Cloud className="w-6 h-6" />,
    available: true,
  },
  {
    id: "azure",
    name: "Azure",
    description: "Deploy to Microsoft Azure Virtual Machine.",
    icon: <Cloud className="w-6 h-6" />,
    available: true,
  },
  {
    id: "gcp",
    name: "Google Cloud",
    description: "Deploy to Google Compute Engine.",
    icon: <Cloud className="w-6 h-6" />,
    available: true,
  },
];

interface StepPlatformProps {
  selectedPlatform: Platform | null;
  onPlatformSelect: (platform: Platform) => void;
  awsConfig: AwsConfig;
  onAwsConfigChange: (config: AwsConfig) => void;
}

export function StepPlatform({ selectedPlatform, onPlatformSelect, awsConfig, onAwsConfigChange }: StepPlatformProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Where should your agent run?</h2>
        <p className="text-muted-foreground mt-1">
          Choose a deployment platform for your OpenClaw agent.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PLATFORMS.map((platform) => {
          const isSelected = selectedPlatform === platform.id;

          return (
            <Card
              key={platform.id}
              className={cn(
                "relative transition-colors",
                platform.available
                  ? "cursor-pointer hover:border-primary"
                  : "opacity-50 cursor-not-allowed",
                isSelected && "border-primary bg-primary/5"
              )}
              onClick={() => platform.available && onPlatformSelect(platform.id)}
            >
              {!platform.available && (
                <span className="absolute top-3 right-3 text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                  Coming Soon
                </span>
              )}
              <CardContent className="pt-6 space-y-2">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {platform.icon}
                </div>
                <p className="font-medium">{platform.name}</p>
                <p className="text-sm text-muted-foreground">{platform.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedPlatform === "aws" && (
        <AwsConfigPanel config={awsConfig} onChange={onAwsConfigChange} />
      )}
    </div>
  );
}
