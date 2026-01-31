import { describe, it, expect } from 'vitest';
import { validateManifest, InstanceManifest } from './manifest';

describe('validateManifest', () => {
  const validManifest = {
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

  it('validates a correct manifest', () => {
    const result = validateManifest(validManifest);
    expect(result).toBeDefined();
    expect(result.metadata.name).toBe('test-bot');
  });

  it('rejects invalid apiVersion', () => {
    const invalid = { ...validManifest, apiVersion: 'v1' };
    expect(() => validateManifest(invalid)).toThrow();
  });

  it('rejects invalid kind', () => {
    const invalid = { ...validManifest, kind: 'Invalid' };
    expect(() => validateManifest(invalid)).toThrow();
  });

  it('rejects name with uppercase letters', () => {
    const invalid = {
      ...validManifest,
      metadata: { ...validManifest.metadata, name: 'TestBot' },
    };
    expect(() => validateManifest(invalid)).toThrow();
  });

  it('rejects name with spaces', () => {
    const invalid = {
      ...validManifest,
      metadata: { ...validManifest.metadata, name: 'test bot' },
    };
    expect(() => validateManifest(invalid)).toThrow();
  });

  it('rejects invalid environment', () => {
    const invalid = {
      ...validManifest,
      metadata: { ...validManifest.metadata, environment: 'invalid' },
    };
    expect(() => validateManifest(invalid)).toThrow();
  });

  it('rejects image tag "latest"', () => {
    const invalid = {
      ...validManifest,
      spec: {
        ...validManifest.spec,
        runtime: { ...validManifest.spec.runtime, image: 'ghcr.io/openclaw/openclaw:latest' },
      },
    };
    expect(() => validateManifest(invalid)).toThrow();
  });

  it('accepts valid semantic version tag', () => {
    const valid = {
      ...validManifest,
      spec: {
        ...validManifest.spec,
        runtime: { ...validManifest.spec.runtime, image: 'ghcr.io/openclaw/openclaw:v1.2.3' },
      },
    };
    const result = validateManifest(valid);
    expect(result.spec.runtime.image).toBe('ghcr.io/openclaw/openclaw:v1.2.3');
  });

  it('rejects cpu below minimum', () => {
    const invalid = {
      ...validManifest,
      spec: {
        ...validManifest.spec,
        runtime: { ...validManifest.spec.runtime, cpu: 0.1 },
      },
    };
    expect(() => validateManifest(invalid)).toThrow();
  });

  it('rejects memory below minimum', () => {
    const invalid = {
      ...validManifest,
      spec: {
        ...validManifest.spec,
        runtime: { ...validManifest.spec.runtime, memory: 100 },
      },
    };
    expect(() => validateManifest(invalid)).toThrow();
  });

  it('replicas defaults to 1', () => {
    const withoutReplicas = {
      ...validManifest,
      spec: {
        ...validManifest.spec,
        runtime: { ...validManifest.spec.runtime, replicas: undefined },
      },
    };
    const result = validateManifest(withoutReplicas);
    expect(result.spec.runtime.replicas).toBe(1);
  });

  it('rejects empty skills allowlist', () => {
    const invalid = {
      ...validManifest,
      spec: {
        ...validManifest.spec,
        skills: { mode: 'ALLOWLIST' as const, allowlist: [] },
      },
    };
    expect(() => validateManifest(invalid)).toThrow();
  });

  it('accepts webhook channel with NONE inbound', () => {
    const valid = {
      ...validManifest,
      spec: {
        ...validManifest.spec,
        channels: [{
          type: 'webhook' as const,
          enabled: true,
          secretRef: { name: 'webhook', provider: 'aws-secrets-manager' as const, key: 'arn' },
        }],
      },
    };
    const result = validateManifest(valid);
    expect(result.spec.channels[0].type).toBe('webhook');
  });
});