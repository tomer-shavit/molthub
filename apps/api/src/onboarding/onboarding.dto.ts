export class OnboardingPreviewDto {
  templateId: string;
  channels?: Array<{ type: string; config: Record<string, unknown> }>;
  configOverrides?: Record<string, unknown>;
}

export class OnboardingDeployDto {
  botName: string;
  templateId: string;
  environment?: string;
  channels?: Array<{ type: string; config: Record<string, unknown> }>;
  configOverrides?: Record<string, unknown>;
  deploymentTarget: {
    type: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    subnetIds?: string[];
    securityGroupId?: string;
    executionRoleArn?: string;
    containerName?: string;
    configPath?: string;
  };
}
