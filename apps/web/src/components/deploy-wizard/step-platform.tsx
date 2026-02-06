"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Monitor, Cloud, Terminal, Server, CheckCircle } from "lucide-react";
import type { AdapterMetadata } from "@/lib/api";
import { GenericCredentialForm } from "./generic-credential-form";
import { TierSelector } from "./tier-selector";
import { CapabilityBadges } from "./capability-badges";
import { SavedCredentialSelector } from "./saved-credential-selector";
import { SaveCredentialCheckbox } from "./save-credential-checkbox";

/** Map adapter types to their credential vault type. */
const ADAPTER_VAULT_TYPE: Record<string, "aws-account"> = {
  "ecs-ec2": "aws-account",
};

export interface StepPlatformProps {
  adapters: AdapterMetadata[];
  selectedPlatform: string | null;
  onPlatformSelect: (platform: string) => void;
  credentials: Record<string, string>;
  onCredentialsChange: (credentials: Record<string, string>) => void;
  selectedTier: string | null;
  onTierSelect: (tier: string) => void;
  savedCredentialId: string | null;
  onSavedCredentialSelect: (id: string | null) => void;
  saveForFuture: { save: boolean; name: string };
  onSaveForFutureChange: (value: { save: boolean; name: string }) => void;
}

function getIconForAdapter(icon: string): React.ReactNode {
  switch (icon) {
    case "docker":
      return <Monitor className="w-6 h-6" />;
    case "aws":
    case "azure":
    case "gcp":
      return <Cloud className="w-6 h-6" />;
    case "local":
      return <Terminal className="w-6 h-6" />;
    default:
      return <Server className="w-6 h-6" />;
  }
}

export function StepPlatform({
  adapters,
  selectedPlatform,
  onPlatformSelect,
  credentials,
  onCredentialsChange,
  selectedTier,
  onTierSelect,
  savedCredentialId,
  onSavedCredentialSelect,
  saveForFuture,
  onSaveForFutureChange,
}: StepPlatformProps) {
  const selectedAdapter = adapters.find((a) => a.type === selectedPlatform);
  const vaultType = selectedPlatform ? ADAPTER_VAULT_TYPE[selectedPlatform] : undefined;
  const [useManual, setUseManual] = useState(!savedCredentialId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Where should your agent run?</h2>
        <p className="text-muted-foreground mt-1">
          Choose a deployment platform for your OpenClaw agent.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {adapters.map((adapter) => {
          const isSelected = selectedPlatform === adapter.type;
          const isAvailable = adapter.status === "ready";

          return (
            <Card
              key={adapter.type}
              className={cn(
                "relative transition-colors",
                isAvailable
                  ? "cursor-pointer hover:border-primary"
                  : "opacity-50 cursor-not-allowed",
                isSelected && "border-primary bg-primary/5"
              )}
              onClick={() => isAvailable && onPlatformSelect(adapter.type)}
            >
              {!isAvailable && (
                <span className="absolute top-3 right-3 text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                  Coming Soon
                </span>
              )}
              <CardContent className="pt-6 space-y-2">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {getIconForAdapter(adapter.icon)}
                </div>
                <p className="font-medium">{adapter.displayName}</p>
                <p className="text-sm text-muted-foreground">
                  {adapter.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedAdapter && (
        <div className="space-y-6">
          <CapabilityBadges capabilities={selectedAdapter.capabilities} />

          {selectedAdapter.credentials.length > 0 && vaultType && (
            <>
              <SavedCredentialSelector
                type={vaultType}
                selectedId={savedCredentialId}
                onSelect={(id) => {
                  onSavedCredentialSelect(id);
                  setUseManual(false);
                }}
                onManual={() => {
                  onSavedCredentialSelect(null);
                  setUseManual(true);
                }}
              />

              {useManual ? (
                <>
                  <GenericCredentialForm
                    credentials={selectedAdapter.credentials}
                    values={credentials}
                    onChange={onCredentialsChange}
                  />
                  <SaveCredentialCheckbox
                    value={saveForFuture}
                    onChange={onSaveForFutureChange}
                  />
                </>
              ) : savedCredentialId ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Using saved AWS credentials.</span>
                </div>
              ) : null}
            </>
          )}

          {selectedAdapter.credentials.length > 0 && !vaultType && (
            <GenericCredentialForm
              credentials={selectedAdapter.credentials}
              values={credentials}
              onChange={onCredentialsChange}
            />
          )}

          {selectedAdapter.tierSpecs &&
            Object.keys(selectedAdapter.tierSpecs).length > 0 && (
              <TierSelector
                tierSpecs={selectedAdapter.tierSpecs}
                selectedTier={selectedTier}
                onTierSelect={onTierSelect}
              />
            )}
        </div>
      )}
    </div>
  );
}
