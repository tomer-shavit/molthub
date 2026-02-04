"use client";

import { Badge } from "@/components/ui/badge";
import {
  Scaling,
  Shield,
  Database,
  Globe,
  FileText,
} from "lucide-react";
import type { AdapterCapabilities } from "@/lib/api";

interface CapabilityBadgesProps {
  capabilities: AdapterCapabilities;
}

interface CapabilityConfig {
  key: keyof AdapterCapabilities;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: "default" | "secondary" | "outline" | "success";
}

const CAPABILITY_CONFIG: CapabilityConfig[] = [
  {
    key: "scaling",
    label: "Auto Scaling",
    icon: Scaling,
    variant: "secondary",
  },
  {
    key: "sandbox",
    label: "Sandbox",
    icon: Shield,
    variant: "secondary",
  },
  {
    key: "persistentStorage",
    label: "Persistent Storage",
    icon: Database,
    variant: "secondary",
  },
  {
    key: "httpsEndpoint",
    label: "HTTPS",
    icon: Globe,
    variant: "secondary",
  },
  {
    key: "logStreaming",
    label: "Log Streaming",
    icon: FileText,
    variant: "secondary",
  },
];

export function CapabilityBadges({ capabilities }: CapabilityBadgesProps) {
  const enabledCapabilities = CAPABILITY_CONFIG.filter(
    (cap) => capabilities[cap.key]
  );

  if (enabledCapabilities.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {enabledCapabilities.map((cap) => {
        const Icon = cap.icon;
        return (
          <Badge key={cap.key} variant={cap.variant} className="gap-1">
            <Icon className="w-3 h-3" />
            {cap.label}
          </Badge>
        );
      })}
    </div>
  );
}
