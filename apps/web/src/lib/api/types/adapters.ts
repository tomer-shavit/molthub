/**
 * Adapter metadata types.
 */

export interface CredentialRequirement {
  key: string;
  displayName: string;
  description: string;
  required: boolean;
  sensitive: boolean;
  pattern?: string;
}

export interface AdapterCapabilities {
  scaling: boolean;
  sandbox: boolean;
  persistentStorage: boolean;
  httpsEndpoint: boolean;
  logStreaming: boolean;
}

export interface TierSpec {
  tier: string;
  cpu: number;
  memory: number;
  dataDiskSizeGb: number;
  machineType?: string;
  vmSize?: string;
}

export interface AdapterMetadata {
  type: string;
  displayName: string;
  icon: string;
  description: string;
  status: "ready" | "beta" | "coming_soon";
  capabilities: AdapterCapabilities;
  credentials: CredentialRequirement[];
  tierSpecs?: Record<string, TierSpec>;
}
