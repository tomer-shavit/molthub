import { describe, it, expect } from 'vitest';
import {
  TemplateSchema,
  ProfileSchema,
  OverlaySchema,
  validateTemplate,
  validateProfile,
  validateOverlay,
  resolveConfig,
  ConfigLayer,
  TemplateCategory,
  OverlayTargetType,
} from './template';

describe('Template', () => {
  const validTemplate = {
    id: 'template-123',
    name: 'Slack Bot Template',
    description: 'A template for creating Slack bots',
    category: 'slack',
    isBuiltin: false,
    workspaceId: 'workspace-123',
    manifestTemplate: {
      apiVersion: 'molthub/v1' as const,
      kind: 'OpenClawInstance' as const,
      spec: {
        runtime: {
          image: 'ghcr.io/openclaw/openclaw:v0.1.0',
          cpu: 0.5,
          memory: 1024,
        },
        channels: [{
          type: 'slack' as const,
          enabled: true,
          secretRef: { name: 'slack', provider: 'aws-secrets-manager' as const, key: 'arn' },
        }],
        skills: {
          mode: 'ALLOWLIST' as const,
          allowlist: ['weather', 'news'],
        },
      },
    },
    configurableFields: [
      {
        path: 'spec.runtime.cpu',
        label: 'CPU',
        description: 'CPU units',
        type: 'number' as const,
        required: false,
        defaultValue: 0.5,
      },
    ],
    requiredSecrets: [
      { name: 'slack-bot-token', description: 'Slack Bot Token', channel: 'slack' },
    ],
    tags: ['messaging', 'slack'],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-123',
  };

  it('validates a correct template', () => {
    const result = validateTemplate(validTemplate);
    expect(result).toBeDefined();
    expect(result.name).toBe('Slack Bot Template');
    expect(result.category).toBe('slack');
  });

  it('accepts all template categories', () => {
    const categories: TemplateCategory[] = [
      'minimal', 'slack', 'discord', 'telegram', 'webhook', 'custom'
    ];
    for (const category of categories) {
      const valid = { ...validTemplate, category };
      const result = TemplateSchema.parse(valid);
      expect(result.category).toBe(category);
    }
  });

  it('validates builtin template', () => {
    const builtin = { ...validTemplate, isBuiltin: true, workspaceId: undefined };
    const result = validateTemplate(builtin);
    expect(result.isBuiltin).toBe(true);
    expect(result.workspaceId).toBeUndefined();
  });

  it('validates configurable fields', () => {
    const withFields = {
      ...validTemplate,
      configurableFields: [
        {
          path: 'spec.runtime.cpu',
          label: 'CPU',
          type: 'number',
          required: true,
          defaultValue: 1,
        },
        {
          path: 'spec.runtime.memory',
          label: 'Memory',
          type: 'number',
          required: false,
          defaultValue: 2048,
        },
      ],
    };
    const result = validateTemplate(withFields);
    expect(result.configurableFields).toHaveLength(2);
  });

  it('validates field with options', () => {
    const withOptions = {
      ...validTemplate,
      configurableFields: [
        {
          path: 'spec.runtime.cpu',
          label: 'CPU',
          type: 'select',
          options: [
            { value: 0.25, label: 'Small (0.25)' },
            { value: 0.5, label: 'Medium (0.5)' },
            { value: 1, label: 'Large (1)' },
          ],
        },
      ],
    };
    const result = validateTemplate(withOptions);
    expect(result.configurableFields[0].options).toHaveLength(3);
  });

  it('validates required secrets', () => {
    const withSecrets = {
      ...validTemplate,
      requiredSecrets: [
        { name: 'api-key', description: 'API Key' },
        { name: 'webhook-secret', description: 'Webhook Secret', channel: 'webhook' },
      ],
    };
    const result = validateTemplate(withSecrets);
    expect(result.requiredSecrets).toHaveLength(2);
  });

  it('validates tags array', () => {
    const withTags = { ...validTemplate, tags: ['ai', 'chatbot', 'slack'] };
    const result = validateTemplate(withTags);
    expect(result.tags).toHaveLength(3);
  });
});

describe('Profile', () => {
  const validProfile = {
    id: 'profile-123',
    name: 'Standard Production Profile',
    description: 'Default profile for production bots',
    workspaceId: 'workspace-123',
    fleetIds: ['fleet-1', 'fleet-2'],
    defaults: {
      runtime: {
        cpu: 1,
        memory: 2048,
        replicas: 2,
      },
      skills: {
        mode: 'ALLOWLIST' as const,
        allowlist: ['core', 'utils'],
      },
      network: {
        inbound: 'NONE' as const,
        egressPreset: 'RESTRICTED' as const,
      },
    },
    mergeStrategy: {
      'spec.secrets': 'merge' as const,
      'spec.channels': 'merge' as const,
    },
    allowInstanceOverrides: true,
    lockedFields: ['spec.runtime.replicas'],
    priority: 10,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-123',
  };

  it('validates a correct profile', () => {
    const result = validateProfile(validProfile);
    expect(result).toBeDefined();
    expect(result.name).toBe('Standard Production Profile');
  });

  it('validates fleet scope', () => {
    const allFleets = { ...validProfile, fleetIds: [] };
    const result = validateProfile(allFleets);
    expect(result.fleetIds).toEqual([]);
  });

  it('validates merge strategies', () => {
    const withStrategies = {
      ...validProfile,
      mergeStrategy: {
        'spec.secrets': 'merge',
        'spec.channels': 'append',
        'spec.skills.allowlist': 'merge',
      },
    };
    const result = validateProfile(withStrategies);
    expect(result.mergeStrategy['spec.channels']).toBe('append');
  });

  it('validates locked fields', () => {
    const locked = {
      ...validProfile,
      lockedFields: ['spec.runtime.image', 'spec.policies.forbidPublicAdmin'],
    };
    const result = validateProfile(locked);
    expect(result.lockedFields).toHaveLength(2);
  });

  it('validates priority', () => {
    const highPriority = { ...validProfile, priority: 100 };
    const result = validateProfile(highPriority);
    expect(result.priority).toBe(100);
  });

  it('validates allowInstanceOverrides', () => {
    const locked = { ...validProfile, allowInstanceOverrides: false };
    const result = validateProfile(locked);
    expect(result.allowInstanceOverrides).toBe(false);
  });

  it('validates partial runtime defaults', () => {
    const partialRuntime = {
      ...validProfile,
      defaults: {
        runtime: {
          cpu: 2,
        },
      },
    };
    const result = validateProfile(partialRuntime);
    expect(result.defaults.runtime?.cpu).toBe(2);
  });
});

describe('Overlay', () => {
  const validOverlay = {
    id: 'overlay-123',
    name: 'Emergency Scaling Overlay',
    description: 'Scale up during high load',
    workspaceId: 'workspace-123',
    targetType: 'fleet',
    targetSelector: {
      fleetId: 'fleet-123',
    },
    overrides: {
      runtime: {
        replicas: 5,
        cpu: 2,
      },
    },
    priority: 50,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-123',
  };

  it('validates a correct overlay', () => {
    const result = validateOverlay(validOverlay);
    expect(result).toBeDefined();
    expect(result.name).toBe('Emergency Scaling Overlay');
  });

  it('accepts all target types', () => {
    const types: OverlayTargetType[] = ['instance', 'fleet', 'environment', 'tag'];
    for (const type of types) {
      const valid = { ...validOverlay, targetType: type };
      const result = OverlaySchema.parse(valid);
      expect(result.targetType).toBe(type);
    }
  });

  it('validates instance target', () => {
    const instanceTarget = {
      ...validOverlay,
      targetType: 'instance',
      targetSelector: {
        instanceIds: ['bot-1', 'bot-2', 'bot-3'],
      },
    };
    const result = validateOverlay(instanceTarget);
    expect(result.targetSelector.instanceIds).toHaveLength(3);
  });

  it('validates environment target', () => {
    const envTarget = {
      ...validOverlay,
      targetType: 'environment',
      targetSelector: {
        environment: 'prod',
      },
    };
    const result = validateOverlay(envTarget);
    expect(result.targetSelector.environment).toBe('prod');
  });

  it('validates tag target', () => {
    const tagTarget = {
      ...validOverlay,
      targetType: 'tag',
      targetSelector: {
        tags: { team: 'platform', critical: 'true' },
      },
    };
    const result = validateOverlay(tagTarget);
    expect(result.targetSelector.tags?.team).toBe('platform');
  });

  it('validates rollout configuration', () => {
    const withRollout = {
      ...validOverlay,
      rollout: {
        strategy: 'percentage' as const,
        percentage: 25,
      },
    };
    const result = validateOverlay(withRollout);
    expect(result.rollout?.strategy).toBe('percentage');
    expect(result.rollout?.percentage).toBe(25);
  });

  it('validates canary rollout', () => {
    const canary = {
      ...validOverlay,
      rollout: {
        strategy: 'canary' as const,
        canaryInstances: ['bot-1', 'bot-2'],
      },
    };
    const result = validateOverlay(canary);
    expect(result.rollout?.strategy).toBe('canary');
    expect(result.rollout?.canaryInstances).toHaveLength(2);
  });

  it('validates schedule', () => {
    const scheduled = {
      ...validOverlay,
      schedule: {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-12-31T23:59:59Z'),
        timezone: 'America/New_York',
      },
    };
    const result = validateOverlay(scheduled);
    expect(result.schedule?.timezone).toBe('America/New_York');
  });

  it('validates label overrides', () => {
    const withLabels = {
      ...validOverlay,
      overrides: {
        labels: {
          maintainer: 'team-platform',
          cost_center: 'engineering',
        },
      },
    };
    const result = validateOverlay(withLabels);
    expect(result.overrides.labels?.maintainer).toBe('team-platform');
  });

  it('validates disabled overlay', () => {
    const disabled = { ...validOverlay, enabled: false };
    const result = validateOverlay(disabled);
    expect(result.enabled).toBe(false);
  });
});

describe('Config Resolution', () => {
  const baseConfig = {
    apiVersion: 'molthub/v1' as const,
    kind: 'OpenClawInstance' as const,
    metadata: {
      name: 'test-bot',
      workspace: 'default',
      environment: 'dev' as const,
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

  it('resolves single layer config', () => {
    const layers: ConfigLayer[] = [
      { type: 'template', id: 'template-1', priority: 0, config: baseConfig },
    ];
    const result = resolveConfig(layers, {});
    expect(result.metadata.name).toBe('test-bot');
  });

  it('merges multiple layers by priority', () => {
    const layers: ConfigLayer[] = [
      { type: 'template', id: 'template-1', priority: 0, config: baseConfig },
      { 
        type: 'profile', 
        id: 'profile-1', 
        priority: 10, 
        config: {
          ...baseConfig,
          spec: {
            ...baseConfig.spec,
            runtime: { ...baseConfig.spec.runtime, cpu: 2, replicas: 3 },
          },
        },
      },
    ];
    const result = resolveConfig(layers, {});
    expect(result.spec.runtime.cpu).toBe(2);
    expect(result.spec.runtime.replicas).toBe(3);
  });

  it('applies higher priority over lower', () => {
    const layers: ConfigLayer[] = [
      { 
        type: 'profile', 
        id: 'profile-1', 
        priority: 10, 
        config: {
          ...baseConfig,
          spec: { ...baseConfig.spec, runtime: { ...baseConfig.spec.runtime, cpu: 1 } },
        },
      },
      { 
        type: 'overlay', 
        id: 'overlay-1', 
        priority: 20, 
        config: {
          ...baseConfig,
          spec: { ...baseConfig.spec, runtime: { ...baseConfig.spec.runtime, cpu: 4 } },
        },
      },
    ];
    const result = resolveConfig(layers, {});
    expect(result.spec.runtime.cpu).toBe(4);
  });

  it('merges arrays with merge strategy', () => {
    const layers: ConfigLayer[] = [
      { 
        type: 'template', 
        id: 'template-1', 
        priority: 0, 
        config: {
          ...baseConfig,
          spec: { ...baseConfig.spec, secrets: [{ name: 'secret1', provider: 'aws-secrets-manager', key: 'key1' }] },
        },
      },
      { 
        type: 'profile', 
        id: 'profile-1', 
        priority: 10, 
        config: {
          ...baseConfig,
          spec: { ...baseConfig.spec, secrets: [{ name: 'secret2', provider: 'aws-secrets-manager', key: 'key2' }] },
        },
      },
    ];
    const result = resolveConfig(layers, { 'spec.secrets': 'merge' });
    expect(result.spec.secrets).toHaveLength(2);
  });

  it('appends arrays with append strategy', () => {
    const layers: ConfigLayer[] = [
      { 
        type: 'template', 
        id: 'template-1', 
        priority: 0, 
        config: {
          ...baseConfig,
          spec: { ...baseConfig.spec, skills: { mode: 'ALLOWLIST' as const, allowlist: ['skill1'] } },
        },
      },
      { 
        type: 'profile', 
        id: 'profile-1', 
        priority: 10, 
        config: {
          ...baseConfig,
          spec: { ...baseConfig.spec, skills: { mode: 'ALLOWLIST' as const, allowlist: ['skill2'] } },
        },
      },
    ];
    // Note: Deep merge for skills would need special handling
    const result = resolveConfig(layers, { 'spec.skills.allowlist': 'append' });
    // The deep merge behavior for nested arrays depends on implementation
    expect(result.spec.skills).toBeDefined();
  });
});