"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, Loader2, DollarSign, Shield } from "lucide-react";
import { api } from "@/lib/api";

export interface AwsConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  tier: "simple" | "production";
  certificateArn?: string;
  allowedCidr?: string;
}

interface AwsConfigPanelProps {
  config: AwsConfig;
  onChange: (config: AwsConfig) => void;
}

const REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "EU (Ireland)" },
  { value: "eu-central-1", label: "EU (Frankfurt)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
];

const TIERS = [
  {
    id: "simple" as const,
    name: "Simple",
    price: "~$30/mo",
    description: "Direct public IP, no load balancer. Best for personal use.",
    icon: DollarSign,
  },
  {
    id: "production" as const,
    name: "Production",
    price: "~$70/mo",
    description: "Private VPC + Load Balancer + TLS. Best for production.",
    icon: Shield,
  },
];

export function AwsConfigPanel({ config, onChange }: AwsConfigPanelProps) {
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    accountId?: string;
    error?: string;
  } | null>(null);

  const update = (partial: Partial<AwsConfig>) => {
    onChange({ ...config, ...partial });
    // Reset validation when credentials change
    if ("accessKeyId" in partial || "secretAccessKey" in partial || "region" in partial) {
      setValidationResult(null);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const result = await api.validateAwsCredentials({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region,
      });
      setValidationResult(result);
    } catch (err) {
      setValidationResult({
        valid: false,
        error: err instanceof Error ? err.message : "Validation failed",
      });
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="aws-access-key" className="text-sm font-medium">AWS Access Key ID</label>
          <Input
            id="aws-access-key"
            placeholder="AKIA..."
            value={config.accessKeyId}
            onChange={(e) => update({ accessKeyId: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="aws-secret-key" className="text-sm font-medium">AWS Secret Access Key</label>
          <Input
            id="aws-secret-key"
            type="password"
            placeholder="Secret access key"
            value={config.secretAccessKey}
            onChange={(e) => update({ secretAccessKey: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="aws-region" className="text-sm font-medium">Region</label>
        <Select
          id="aws-region"
          value={config.region}
          onChange={(e) => update({ region: e.target.value })}
        >
          {REGIONS.map((region) => (
            <option key={region.value} value={region.value}>
              {region.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Deployment Tier</label>
        <div className="grid gap-4 sm:grid-cols-2">
          {TIERS.map((tier) => {
            const TierIcon = tier.icon;
            const isSelected = config.tier === tier.id;

            return (
              <Card
                key={tier.id}
                className={cn(
                  "cursor-pointer transition-colors hover:border-primary",
                  isSelected && "border-primary bg-primary/5"
                )}
                onClick={() => update({ tier: tier.id })}
              >
                <CardContent className="pt-6 space-y-2">
                  <div className="flex items-center gap-2">
                    <TierIcon className="w-5 h-5 text-muted-foreground" />
                    <span className="font-medium">{tier.name}</span>
                    <span className="text-sm text-muted-foreground ml-auto">{tier.price}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{tier.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {config.tier === "simple" && (
        <div className="space-y-2">
          <label htmlFor="aws-allowed-cidr" className="text-sm font-medium">Allowed IP / CIDR (optional)</label>
          <div className="flex gap-2">
            <Input
              id="aws-allowed-cidr"
              placeholder="0.0.0.0/0 (open to all)"
              value={config.allowedCidr || ""}
              onChange={(e) => update({ allowedCidr: e.target.value || undefined })}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const res = await fetch("https://api.ipify.org?format=json");
                  const data = await res.json();
                  if (data.ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(data.ip)) {
                    update({ allowedCidr: `${data.ip}/32` });
                  }
                } catch {
                  // IP lookup unavailable — user can enter manually
                }
              }}
            >
              Use my IP
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Restrict gateway access to a specific IP or CIDR range. Leave empty to allow all traffic.
          </p>
        </div>
      )}

      {config.tier === "production" && (
        <div className="space-y-2">
          <label htmlFor="aws-certificate-arn" className="text-sm font-medium">Certificate ARN (optional)</label>
          <Input
            id="aws-certificate-arn"
            placeholder="arn:aws:acm:us-east-1:123456789:certificate/..."
            value={config.certificateArn || ""}
            onChange={(e) => update({ certificateArn: e.target.value || undefined })}
          />
          <p className="text-xs text-muted-foreground">
            ACM certificate ARN for TLS termination on the load balancer.
          </p>
        </div>
      )}

      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          onClick={handleValidate}
          disabled={validating || !config.accessKeyId || !config.secretAccessKey}
        >
          {validating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Validate Credentials
        </Button>

        {validationResult && (
          <div className="flex items-center gap-2 text-sm">
            {validationResult.valid ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-green-600">
                  Valid — Account {validationResult.accountId}
                </span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-red-600" />
                <span className="text-red-600">
                  {validationResult.error || "Invalid credentials"}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
