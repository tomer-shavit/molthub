/**
 * Test Fixtures and Factories for Molthub
 * 
 * Provides factory functions for creating test data with sensible defaults.
 * All IDs are deterministic based on a counter for reproducible tests.
 */

import { v4 as uuidv4 } from 'uuid';

// Counter for deterministic IDs
let idCounter = 0;

/**
 * Generate a unique deterministic ID
 */
export function generateId(prefix: string = 'test'): string {
  return `${prefix}-${++idCounter}-${Date.now().toString(36)}`;
}

/**
 * Reset the ID counter (useful for test isolation)
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

// =============================================================================
// Fleet Fixtures
// =============================================================================

export interface FleetOptions {
  id?: string;
  name?: string;
  workspaceId?: string;
  environment?: 'dev' | 'staging' | 'prod';
  status?: 'ACTIVE' | 'PAUSED' | 'DRAINING' | 'ERROR';
  description?: string;
  tags?: Record<string, string>;
  ecsClusterArn?: string;
  vpcId?: string;
  privateSubnetIds?: string[];
  securityGroupId?: string;
  defaultProfileId?: string;
  enforcedPolicyPackIds?: string[];
}

export function createFleet(options: FleetOptions = {}) {
  return {
    id: options.id ?? generateId('fleet'),
    name: options.name ?? 'test-fleet',
    workspaceId: options.workspaceId ?? generateId('workspace'),
    environment: options.environment ?? 'dev',
    status: options.status ?? 'ACTIVE',
    description: options.description ?? 'Test fleet',
    tags: options.tags ?? { team: 'test', environment: 'dev' },
    ecsClusterArn: options.ecsClusterArn,
    vpcId: options.vpcId,
    privateSubnetIds: options.privateSubnetIds ?? [],
    securityGroupId: options.securityGroupId,
    defaultProfileId: options.defaultProfileId,
    enforcedPolicyPackIds: options.enforcedPolicyPackIds ?? [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// =============================================================================
// Bot Instance Fixtures
// =============================================================================

export interface BotInstanceOptions {
  id?: string;
  name?: string;
  workspaceId?: string;
  fleetId?: string;
  templateId?: string;
  profileId?: string;
  overlayIds?: string[];
  status?: 'CREATING' | 'PENDING' | 'RUNNING' | 'DEGRADED' | 'STOPPED' | 'PAUSED' | 'DELETING' | 'ERROR' | 'RECONCILING';
  health?: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN' | 'DEGRADED';
  desiredManifest?: any;
  appliedManifestVersion?: string | null;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
  lastReconcileAt?: Date | null;
  lastHealthCheckAt?: Date | null;
  lastError?: string | null;
  errorCount?: number;
  restartCount?: number;
  uptimeSeconds?: number;
  ecsClusterArn?: string;
  ecsServiceArn?: string;
  taskDefinitionArn?: string;
  cloudwatchLogGroup?: string;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
}

export function createValidManifest(options: { name?: string; environment?: 'dev' | 'staging' | 'prod' } = {}) {
  return {
    apiVersion: 'molthub/v1',
    kind: 'OpenClawInstance',
    metadata: {
      name: options.name ?? 'test-bot',
      workspace: 'default',
      environment: options.environment ?? 'dev',
      labels: {},
    },
    spec: {
      runtime: {
        image: 'ghcr.io/openclaw/openclaw:v0.1.0',
        cpu: 0.5,
        memory: 1024,
        replicas: 1,
      },
      secrets: [],
      channels: [],
      skills: {
        mode: 'ALLOWLIST',
        allowlist: ['weather'],
      },
      network: {
        inbound: 'NONE',
        egressPreset: 'RESTRICTED',
      },
      observability: {
        logLevel: 'info',
        tracing: false,
      },
      policies: {
        forbidPublicAdmin: true,
        requireSecretManager: true,
      },
    },
  };
}

export function createBotInstance(options: BotInstanceOptions = {}) {
  return {
    id: options.id ?? generateId('bot'),
    name: options.name ?? 'test-bot',
    workspaceId: options.workspaceId ?? generateId('workspace'),
    fleetId: options.fleetId ?? generateId('fleet'),
    templateId: options.templateId ?? generateId('template'),
    profileId: options.profileId,
    overlayIds: options.overlayIds ?? [],
    status: options.status ?? 'CREATING',
    health: options.health ?? 'UNKNOWN',
    desiredManifest: options.desiredManifest ?? createValidManifest({ name: options.name }),
    appliedManifestVersion: options.appliedManifestVersion ?? null,
    tags: options.tags ?? {},
    metadata: options.metadata ?? {},
    errorCount: options.errorCount ?? 0,
    restartCount: options.restartCount ?? 0,
    uptimeSeconds: options.uptimeSeconds ?? 0,
    lastError: options.lastError ?? null,
    lastReconcileAt: 'lastReconcileAt' in options ? options.lastReconcileAt : undefined,
    lastHealthCheckAt: 'lastHealthCheckAt' in options ? options.lastHealthCheckAt : undefined,
    ecsClusterArn: options.ecsClusterArn,
    ecsServiceArn: options.ecsServiceArn,
    taskDefinitionArn: options.taskDefinitionArn,
    cloudwatchLogGroup: options.cloudwatchLogGroup,
    createdAt: options.createdAt ?? new Date(),
    updatedAt: options.updatedAt ?? new Date(),
    createdBy: options.createdBy ?? 'test-user',
  };
}

// =============================================================================
// Connector Fixtures
// =============================================================================

export interface ConnectorOptions {
  id?: string;
  name?: string;
  type?: string;
  workspaceId?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'PENDING';
  config?: any;
  isShared?: boolean;
  description?: string;
  allowedInstanceIds?: string[];
  lastTestedAt?: Date | null;
  lastTestResult?: 'SUCCESS' | 'FAILURE';
  lastError?: string;
  usageCount?: number;
  lastUsedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
}

export function createSecretRef(name: string): {
  name: string;
  provider: 'aws-secrets-manager';
  arn: string;
} {
  return {
    name,
    provider: 'aws-secrets-manager',
    arn: `arn:aws:secretsmanager:us-east-1:123456789:secret:${name}`,
  };
}

export function createConnector(options: ConnectorOptions = {}) {
  const type = options.type ?? 'openai';
  
  const defaultConfigs: Record<string, any> = {
    openai: {
      type: 'openai',
      apiKey: createSecretRef('openai-api-key'),
      defaultModel: 'gpt-4',
    },
    slack: {
      type: 'slack',
      botToken: createSecretRef('slack-bot-token'),
      signingSecret: createSecretRef('slack-signing-secret'),
      socketMode: true,
    },
    discord: {
      type: 'discord',
      botToken: createSecretRef('discord-bot-token'),
      applicationId: '123456789',
    },
    telegram: {
      type: 'telegram',
      botToken: createSecretRef('telegram-bot-token'),
    },
    aws: {
      type: 'aws',
      accessKeyId: createSecretRef('aws-access-key'),
      secretAccessKey: createSecretRef('aws-secret-key'),
      region: 'us-east-1',
    },
    postgres: {
      type: 'postgres',
      connectionString: createSecretRef('postgres-connection-string'),
      ssl: true,
    },
  };

  return {
    id: options.id ?? generateId('conn'),
    name: options.name ?? `Test ${type} Connector`,
    description: 'description' in options ? options.description : `Test connector for ${type}`,
    workspaceId: options.workspaceId ?? generateId('workspace'),
    type,
    config: options.config ?? defaultConfigs[type] ?? { type: 'custom', credentials: {}, config: {} },
    status: options.status ?? 'ACTIVE',
    isShared: options.isShared ?? true,
    allowedInstanceIds: options.allowedInstanceIds ?? [],
    usageCount: options.usageCount ?? 0,
    lastTestedAt: 'lastTestedAt' in options ? options.lastTestedAt : undefined,
    lastTestResult: options.lastTestResult,
    lastError: options.lastError,
    lastUsedAt: 'lastUsedAt' in options ? options.lastUsedAt : undefined,
    tags: {},
    createdAt: options.createdAt ?? new Date(),
    updatedAt: options.updatedAt ?? new Date(),
    createdBy: options.createdBy ?? 'test-user',
  };
}

// =============================================================================
// Template Fixtures
// =============================================================================

export interface TemplateOptions {
  id?: string;
  name?: string;
  category?: 'minimal' | 'slack' | 'discord' | 'telegram' | 'webhook' | 'custom';
  workspaceId?: string;
  isBuiltin?: boolean;
}

export function createTemplate(options: TemplateOptions = {}) {
  const category = options.category ?? 'minimal';
  
  return {
    id: options.id ?? generateId('template'),
    name: options.name ?? `Test ${category} Template`,
    description: `A test template for ${category} bots`,
    category,
    isBuiltin: options.isBuiltin ?? false,
    workspaceId: options.isBuiltin ? undefined : (options.workspaceId ?? generateId('workspace')),
    manifestTemplate: {
      apiVersion: 'molthub/v1',
      kind: 'OpenClawInstance',
      spec: {
        runtime: {
          image: 'ghcr.io/openclaw/openclaw:v0.1.0',
          cpu: 0.5,
          memory: 1024,
        },
        channels: [],
        skills: {
          mode: 'ALLOWLIST',
          allowlist: ['core'],
        },
      },
    },
    configurableFields: [],
    requiredSecrets: [],
    tags: ['test'],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  };
}

// =============================================================================
// Profile Fixtures
// =============================================================================

export interface ProfileOptions {
  id?: string;
  name?: string;
  workspaceId?: string;
  fleetIds?: string[];
  priority?: number;
}

export function createProfile(options: ProfileOptions = {}) {
  return {
    id: options.id ?? generateId('profile'),
    name: options.name ?? 'Test Profile',
    description: 'A test profile',
    workspaceId: options.workspaceId ?? generateId('workspace'),
    fleetIds: options.fleetIds ?? [],
    defaults: {
      runtime: {
        cpu: 1,
        memory: 2048,
      },
    },
    mergeStrategy: {},
    allowInstanceOverrides: true,
    lockedFields: [],
    priority: options.priority ?? 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  };
}

// =============================================================================
// Overlay Fixtures
// =============================================================================

export interface OverlayOptions {
  id?: string;
  name?: string;
  workspaceId?: string;
  targetType?: 'instance' | 'fleet' | 'environment' | 'tag';
  enabled?: boolean;
  priority?: number;
}

export function createOverlay(options: OverlayOptions = {}) {
  const targetType = options.targetType ?? 'fleet';
  
  const targetSelectors: Record<string, any> = {
    instance: { instanceIds: [generateId('bot')] },
    fleet: { fleetId: generateId('fleet') },
    environment: { environment: 'prod' },
    tag: { tags: { team: 'platform' } },
  };

  return {
    id: options.id ?? generateId('overlay'),
    name: options.name ?? 'Test Overlay',
    description: 'A test overlay',
    workspaceId: options.workspaceId ?? generateId('workspace'),
    targetType,
    targetSelector: targetSelectors[targetType],
    overrides: {
      runtime: {
        replicas: 3,
      },
    },
    priority: options.priority ?? 0,
    enabled: options.enabled ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  };
}

// =============================================================================
// Policy Pack Fixtures
// =============================================================================

export interface PolicyPackOptions {
  id?: string;
  name?: string;
  workspaceId?: string;
  isBuiltin?: boolean;
  isEnforced?: boolean;
  autoApply?: boolean;
}

export function createPolicyRule(options: { type?: string; severity?: 'ERROR' | 'WARNING' | 'INFO' } = {}) {
  const type = options.type ?? 'require_image_pinning';
  
  return {
    id: generateId('rule'),
    name: `Test ${type} Rule`,
    description: `A test rule for ${type}`,
    type,
    severity: options.severity ?? 'ERROR',
    config: { type, enabled: true },
  };
}

export function createPolicyPack(options: PolicyPackOptions = {}) {
  return {
    id: options.id ?? generateId('pack'),
    name: options.name ?? 'Test Policy Pack',
    description: 'A test policy pack',
    workspaceId: options.isBuiltin ? undefined : (options.workspaceId ?? generateId('workspace')),
    isBuiltin: options.isBuiltin ?? false,
    autoApply: options.autoApply ?? false,
    rules: [createPolicyRule()],
    isEnforced: options.isEnforced ?? false,
    priority: 100,
    version: '1.0.0',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  };
}

// =============================================================================
// Mock Data Generators
// =============================================================================

export function generateRandomString(length: number = 10): string {
  return Math.random().toString(36).substring(2, 2 + length);
}

export function generateRandomEmail(): string {
  return `test-${generateRandomString(5)}@example.com`;
}

export function generateRandomDate(start: Date = new Date(2020, 0, 1), end: Date = new Date()): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

export function generateArray<T>(factory: (index: number) => T, count: number): T[] {
  return Array.from({ length: count }, (_, i) => factory(i));
}

// =============================================================================
// Edge Case Generators
// =============================================================================

export function createInvalidManifests() {
  const baseManifest = createValidManifest();

  return {
    // Schema violations
    missingApiVersion: () => {
      const { apiVersion, ...rest } = baseManifest;
      return rest;
    },
    invalidApiVersion: () => ({ ...baseManifest, apiVersion: 'invalid/v1' }),
    missingKind: () => {
      const { kind, ...rest } = baseManifest;
      return rest;
    },
    invalidKind: () => ({ ...baseManifest, kind: 'InvalidKind' }),
    
    // Metadata violations
    nameWithUppercase: () => ({
      ...baseManifest,
      metadata: { ...baseManifest.metadata, name: 'TestBot' },
    }),
    nameWithSpaces: () => ({
      ...baseManifest,
      metadata: { ...baseManifest.metadata, name: 'test bot' },
    }),
    nameWithUnderscores: () => ({
      ...baseManifest,
      metadata: { ...baseManifest.metadata, name: 'test_bot' },
    }),
    emptyName: () => ({
      ...baseManifest,
      metadata: { ...baseManifest.metadata, name: '' },
    }),
    invalidEnvironment: () => ({
      ...baseManifest,
      metadata: { ...baseManifest.metadata, environment: 'invalid' },
    }),
    
    // Runtime violations
    latestImageTag: () => ({
      ...baseManifest,
      spec: {
        ...baseManifest.spec,
        runtime: { ...baseManifest.spec.runtime, image: 'image:latest' },
      },
    }),
    unpinnedImage: () => ({
      ...baseManifest,
      spec: {
        ...baseManifest.spec,
        runtime: { ...baseManifest.spec.runtime, image: 'image' },
      },
    }),
    cpuTooLow: () => ({
      ...baseManifest,
      spec: {
        ...baseManifest.spec,
        runtime: { ...baseManifest.spec.runtime, cpu: 0.1 },
      },
    }),
    cpuTooHigh: () => ({
      ...baseManifest,
      spec: {
        ...baseManifest.spec,
        runtime: { ...baseManifest.spec.runtime, cpu: 1000 },
      },
    }),
    memoryTooLow: () => ({
      ...baseManifest,
      spec: {
        ...baseManifest.spec,
        runtime: { ...baseManifest.spec.runtime, memory: 100 },
      },
    }),
    negativeReplicas: () => ({
      ...baseManifest,
      spec: {
        ...baseManifest.spec,
        runtime: { ...baseManifest.spec.runtime, replicas: -1 },
      },
    }),
    zeroReplicas: () => ({
      ...baseManifest,
      spec: {
        ...baseManifest.spec,
        runtime: { ...baseManifest.spec.runtime, replicas: 0 },
      },
    }),
    tooManyReplicas: () => ({
      ...baseManifest,
      spec: {
        ...baseManifest.spec,
        runtime: { ...baseManifest.spec.runtime, replicas: 1001 },
      },
    }),
    
    // Skills violations
    emptyAllowlist: () => ({
      ...baseManifest,
      spec: {
        ...baseManifest.spec,
        skills: { mode: 'ALLOWLIST', allowlist: [] },
      },
    }),
    
    // Security violations
    permissiveEgress: () => ({
      ...baseManifest,
      spec: {
        ...baseManifest.spec,
        network: { ...baseManifest.spec.network, egressPreset: 'DEFAULT' },
      },
    }),
    publicInbound: () => ({
      ...baseManifest,
      spec: {
        ...baseManifest.spec,
        network: { ...baseManifest.spec.network, inbound: 'PUBLIC' },
      },
    }),
    
    // Secret violations
    plaintextSecret: () => ({
      ...baseManifest,
      spec: {
        ...baseManifest.spec,
        secrets: [{ name: 'secret', value: 'plaintext-password' }],
      },
    }),
  };
}
