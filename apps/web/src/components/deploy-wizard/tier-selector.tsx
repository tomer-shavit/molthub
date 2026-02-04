"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Cpu, HardDrive, MemoryStick, Check } from "lucide-react";
import type { TierSpec } from "@/lib/api";

interface TierSelectorProps {
  tierSpecs: Record<string, TierSpec>;
  selectedTier: string | null;
  onTierSelect: (tier: string) => void;
}

function formatMemory(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`;
  }
  return `${mb} MB`;
}

function formatCpu(cpu: number): string {
  if (cpu < 1) {
    return `${(cpu * 1000).toFixed(0)} mCPU`;
  }
  return `${cpu} vCPU${cpu > 1 ? "s" : ""}`;
}

function formatDisk(gb: number): string {
  return `${gb} GB`;
}

export function TierSelector({
  tierSpecs,
  selectedTier,
  onTierSelect,
}: TierSelectorProps) {
  const tiers = Object.entries(tierSpecs);

  if (tiers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Resource Tier</label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map(([key, spec]) => {
          const isSelected = selectedTier === key;

          return (
            <Card
              key={key}
              className={cn(
                "cursor-pointer transition-all hover:border-primary hover:shadow-sm",
                isSelected && "border-primary bg-primary/5 ring-1 ring-primary"
              )}
              onClick={() => onTierSelect(key)}
            >
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{spec.tier}</span>
                  {isSelected && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Cpu className="w-4 h-4 flex-shrink-0" />
                    <span>{formatCpu(spec.cpu)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MemoryStick className="w-4 h-4 flex-shrink-0" />
                    <span>{formatMemory(spec.memory)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <HardDrive className="w-4 h-4 flex-shrink-0" />
                    <span>{formatDisk(spec.dataDiskSizeGb)}</span>
                  </div>
                </div>

                {(spec.machineType || spec.vmSize) && (
                  <p className="text-xs text-muted-foreground pt-1 border-t">
                    {spec.machineType || spec.vmSize}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
