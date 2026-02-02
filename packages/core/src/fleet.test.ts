import { describe, it, expect } from 'vitest';
import {
  FleetSchema,
  BotInstanceSchema,
  ResolvedBotConfigSchema,
  validateFleet,
  validateBotInstance,
  FleetStatus,
  BotStatus,
  BotHealth,
} from './fleet';

describe('Fleet', () => {
  const validFleet = {
    id: 'fleet-123',
    name: 'production-fleet',
    workspaceId: 'workspace-123',
    environment: 'prod',
    description: 'Production fleet for customer-facing bots',
    status: 'ACTIVE',
    tags: { team: 'platform', cost_center: 'engineering' },
    ecsClusterArn: 'arn:aws:ecs:us-east-1:123456789:cluster/prod',
    vpcId: 'vpc-123456',
    privateSubnetIds: ['subnet-1', 'subnet-2'],
    securityGroupId: 'sg-123456',
    defaultProfileId: 'profile-123',
    enforcedPolicyPackIds: ['pack-1', 'pack-2'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('validates a correct fleet', () => {
    const result = validateFleet(validFleet);
    expect(result).toBeDefined();
    expect(result.name).toBe('production-fleet');
    expect(result.status).toBe('ACTIVE');
  });

  it('rejects fleet name with uppercase', () => {
    const invalid = { ...validFleet, name: 'Production-Fleet' };
    expect(() => validateFleet(invalid)).toThrow();
  });

  it('rejects fleet name with spaces', () => {
    const invalid = { ...validFleet, name: 'production fleet' };
    expect(() => validateFleet(invalid)).toThrow();
  });

  it('rejects fleet name with underscores', () => {
    const invalid = { ...validFleet, name: 'production_fleet' };
    expect(() => validateFleet(invalid)).toThrow();
  });

  it('accepts valid fleet status values', () => {
    const statuses: FleetStatus[] = ['ACTIVE', 'PAUSED', 'DRAINING', 'ERROR'];
    for (const status of statuses) {
      const valid = { ...validFleet, status };
      const result = validateFleet(valid);
      expect(result.status).toBe(status);
    }
  });

  it('defaults status to ACTIVE', () => {
    const withoutStatus = { ...validFleet };
    delete (withoutStatus as any).status;
    const result = FleetSchema.parse(withoutStatus);
    expect(result.status).toBe('ACTIVE');
  });

  it('accepts valid environment values', () => {
    const environments = ['dev', 'staging', 'prod'];
    for (const env of environments) {
      const valid = { ...validFleet, environment: env };
      const result = validateFleet(valid);
      expect(result.environment).toBe(env);
    }
  });

  it('rejects invalid environment', () => {
    const invalid = { ...validFleet, environment: 'production' };
    expect(() => validateFleet(invalid)).toThrow();
  });

  it('validates optional AWS resources', () => {
    const minimal = {
      id: 'fleet-456',
      name: 'dev-fleet',
      workspaceId: 'workspace-123',
      environment: 'dev',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = validateFleet(minimal);
    expect(result.ecsClusterArn).toBeUndefined();
    expect(result.privateSubnetIds).toEqual([]);
  });

  it('validates enforced policy pack IDs', () => {
    const withPacks = {
      ...validFleet,
      enforcedPolicyPackIds: ['pack-1', 'pack-2', 'pack-3'],
    };
    const result = validateFleet(withPacks);
    expect(result.enforcedPolicyPackIds).toHaveLength(3);
  });
});

describe('BotInstance', () => {
  const validManifest = {
    apiVersion: 'clawster/v1' as const,
    kind: 'OpenClawInstance' as const,
    metadata: {
      name: 'test-bot',
      workspace: 'default',
      environment: 'dev' as const,
      labels: {},
    },
    spec: {
      runtime: {
        image: 'openclaw:v0.1.0',
        cpu: 0.5,
        memory: 1024,
        replicas: 1,
      },
      secrets: [],
      channels: [],
      skills: {
        mode: 'ALLOWLIST' as const,
        allowlist: ['weather'],
      },
      network: {
        inbound: 'NONE' as const,
        egressPreset: 'RESTRICTED' as const,
      },
      observability: {
        logLevel: 'info' as const,
        tracing: false,
      },
      policies: {
        forbidPublicAdmin: true,
        requireSecretManager: true,
      },
    },
  };

  const validBot = {
    id: 'bot-123',
    name: 'customer-service-bot',
    workspaceId: 'workspace-123',
    fleetId: 'fleet-123',
    templateId: 'template-456',
    profileId: 'profile-789',
    overlayIds: ['overlay-1', 'overlay-2'],
    status: 'RUNNING',
    health: 'HEALTHY',
    desiredManifest: validManifest,
    appliedManifestVersion: 'manifest-v5',
    tags: { team: 'support', priority: 'high' },
    metadata: { version: '1.0.0' },
    lastReconcileAt: new Date(),
    lastHealthCheckAt: new Date(),
    lastError: null,
    errorCount: 0,
    ecsClusterArn: 'arn:aws:ecs:us-east-1:123456789:cluster/prod',
    ecsServiceArn: 'arn:aws:ecs:us-east-1:123456789:service/customer-service-bot',
    taskDefinitionArn: 'arn:aws:ecs:us-east-1:123456789:task-definition/customer-service-bot:5',
    cloudwatchLogGroup: '/ecs/customer-service-bot',
    uptimeSeconds: 86400,
    restartCount: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-123',
  };

  it('validates a correct bot instance', () => {
    const result = validateBotInstance(validBot);
    expect(result).toBeDefined();
    expect(result.name).toBe('customer-service-bot');
    expect(result.status).toBe('RUNNING');
  });

  it('rejects bot name with uppercase', () => {
    const invalid = { ...validBot, name: 'Customer-Service-Bot' };
    expect(() => validateBotInstance(invalid)).toThrow();
  });

  it('rejects bot name with spaces', () => {
    const invalid = { ...validBot, name: 'customer service bot' };
    expect(() => validateBotInstance(invalid)).toThrow();
  });

  it('accepts all valid status values', () => {
    const statuses: BotStatus[] = [
      'CREATING', 'PENDING', 'RUNNING', 'DEGRADED', 
      'STOPPED', 'PAUSED', 'DELETING', 'ERROR', 'RECONCILING'
    ];
    for (const status of statuses) {
      const valid = { ...validBot, status };
      const result = BotInstanceSchema.parse(valid);
      expect(result.status).toBe(status);
    }
  });

  it('accepts all valid health values', () => {
    const healths: BotHealth[] = ['HEALTHY', 'UNHEALTHY', 'UNKNOWN', 'DEGRADED'];
    for (const health of healths) {
      const valid = { ...validBot, health };
      const result = BotInstanceSchema.parse(valid);
      expect(result.health).toBe(health);
    }
  });

  it('defaults status to CREATING', () => {
    const withoutStatus = { ...validBot };
    delete (withoutStatus as any).status;
    const result = BotInstanceSchema.parse(withoutStatus);
    expect(result.status).toBe('CREATING');
  });

  it('defaults health to UNKNOWN', () => {
    const withoutHealth = { ...validBot };
    delete (withoutHealth as any).health;
    const result = BotInstanceSchema.parse(withoutHealth);
    expect(result.health).toBe('UNKNOWN');
  });

  it('validates overlay IDs array', () => {
    const withOverlays = {
      ...validBot,
      overlayIds: ['overlay-1', 'overlay-2', 'overlay-3'],
    };
    const result = validateBotInstance(withOverlays);
    expect(result.overlayIds).toHaveLength(3);
  });

  it('validates error count', () => {
    const withErrors = { ...validBot, errorCount: 5 };
    const result = validateBotInstance(withErrors);
    expect(result.errorCount).toBe(5);
  });

  it('rejects negative error count', () => {
    const invalid = { ...validBot, errorCount: -1 };
    expect(() => validateBotInstance(invalid)).toThrow();
  });

  it('validates restart count', () => {
    const withRestarts = { ...validBot, restartCount: 10 };
    const result = validateBotInstance(withRestarts);
    expect(result.restartCount).toBe(10);
  });

  it('validates uptime seconds', () => {
    const withUptime = { ...validBot, uptimeSeconds: 3600 };
    const result = validateBotInstance(withUptime);
    expect(result.uptimeSeconds).toBe(3600);
  });

  it('validates metadata object', () => {
    const withMetadata = {
      ...validBot,
      metadata: { customField: 'value', nested: { key: 'value' } },
    };
    const result = validateBotInstance(withMetadata);
    expect(result.metadata.customField).toBe('value');
  });

  it('requires fleet association', () => {
    const withoutFleet = { ...validBot };
    delete (withoutFleet as any).fleetId;
    expect(() => validateBotInstance(withoutFleet)).toThrow();
  });

  it('validates manifest is required', () => {
    const withoutManifest = { ...validBot };
    delete (withoutManifest as any).desiredManifest;
    expect(() => validateBotInstance(withoutManifest)).toThrow();
  });
});

describe('ResolvedBotConfig', () => {
  const validManifest = {
    apiVersion: 'clawster/v1' as const,
    kind: 'OpenClawInstance' as const,
    metadata: {
      name: 'test-bot',
      workspace: 'default',
      environment: 'dev' as const,
      labels: {},
    },
    spec: {
      runtime: {
        image: 'openclaw:v0.1.0',
        cpu: 0.5,
        memory: 1024,
        replicas: 1,
      },
      secrets: [],
      channels: [],
      skills: {
        mode: 'ALLOWLIST' as const,
        allowlist: ['weather'],
      },
      network: {
        inbound: 'NONE' as const,
        egressPreset: 'RESTRICTED' as const,
      },
      observability: {
        logLevel: 'info' as const,
        tracing: false,
      },
      policies: {
        forbidPublicAdmin: true,
        requireSecretManager: true,
      },
    },
  };

  const validResolvedConfig = {
    botId: 'bot-123',
    fleetId: 'fleet-123',
    workspaceId: 'workspace-123',
    baseTemplate: 'template-456',
    appliedProfile: 'profile-789',
    appliedOverlays: ['overlay-1', 'overlay-2'],
    manifest: validManifest,
    enforcedPolicyPacks: ['pack-1'],
    validationErrors: [],
    resolvedAt: new Date(),
  };

  it('validates correct resolved config', () => {
    const result = ResolvedBotConfigSchema.parse(validResolvedConfig);
    expect(result).toBeDefined();
    expect(result.botId).toBe('bot-123');
  });

  it('validates with validation errors', () => {
    const withErrors = {
      ...validResolvedConfig,
      validationErrors: [
        { code: 'INVALID_CPU', message: 'CPU must be at least 0.25', field: 'spec.runtime.cpu' },
      ],
    };
    const result = ResolvedBotConfigSchema.parse(withErrors);
    expect(result.validationErrors).toHaveLength(1);
    expect(result.validationErrors[0].code).toBe('INVALID_CPU');
  });

  it('validates without optional template', () => {
    const withoutTemplate = {
      ...validResolvedConfig,
      baseTemplate: undefined,
    };
    const result = ResolvedBotConfigSchema.parse(withoutTemplate);
    expect(result.baseTemplate).toBeUndefined();
  });

  it('validates without optional profile', () => {
    const withoutProfile = {
      ...validResolvedConfig,
      appliedProfile: undefined,
    };
    const result = ResolvedBotConfigSchema.parse(withoutProfile);
    expect(result.appliedProfile).toBeUndefined();
  });

  it('validates empty overlays array', () => {
    const noOverlays = {
      ...validResolvedConfig,
      appliedOverlays: [],
    };
    const result = ResolvedBotConfigSchema.parse(noOverlays);
    expect(result.appliedOverlays).toEqual([]);
  });

  it('validates enforced policy packs', () => {
    const withPacks = {
      ...validResolvedConfig,
      enforcedPolicyPacks: ['pack-1', 'pack-2', 'pack-3'],
    };
    const result = ResolvedBotConfigSchema.parse(withPacks);
    expect(result.enforcedPolicyPacks).toHaveLength(3);
  });
});