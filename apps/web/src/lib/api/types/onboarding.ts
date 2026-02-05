/**
 * Onboarding types.
 */

export interface OnboardingStatus {
  hasInstances: boolean;
}

export interface OnboardingTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  channels: Array<{ type: string; enabled: boolean; defaults: Record<string, unknown> }>;
  requiredInputs: Array<{ key: string; label: string; secret: boolean; placeholder?: string }>;
}

export interface PreviewOnboardingPayload {
  templateId: string;
  channels?: Array<{ type: string; config?: Record<string, unknown> }>;
  configOverrides?: Record<string, unknown>;
}

export interface PreviewOnboardingResult {
  config: Record<string, unknown>;
}

export interface DeployOnboardingPayload {
  templateId?: string;
  botName: string;
  deploymentTarget: { type: string; [key: string]: unknown };
  channels?: Array<{ type: string; config?: Record<string, unknown> }>;
  environment?: string;
  modelConfig?: { provider: string; model: string; apiKey: string };
  fleetId?: string;
  awsCredentialId?: string;
  modelCredentialId?: string;
}

export interface DeployOnboardingResult {
  instanceId: string;
  fleetId: string;
  status: string;
}

export interface ValidateAwsPayload {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface ValidateAwsResult {
  valid: boolean;
  accountId?: string;
  error?: string;
}

export interface DeployStatusResult {
  instanceId: string;
  status: string;
  health: string;
  error?: string;
  steps: Array<{ name: string; status: string }>;
}
