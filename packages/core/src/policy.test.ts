import { describe, it, expect } from 'vitest';
import { PolicyEngine } from './policy';

describe('PolicyEngine', () => {
  const policyEngine = new PolicyEngine();

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

  it('validates a correct manifest', () => {
    const result = policyEngine.validate(validManifest);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('blocks unpinned image tags at schema level', () => {
    const invalid = {
      ...validManifest,
      spec: {
        ...validManifest.spec,
        runtime: { ...validManifest.spec.runtime, image: 'openclaw:latest' },
      },
    };
    const result = policyEngine.validate(invalid);
    expect(result.valid).toBe(false);
    // Schema validation catches this before policy engine
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: 'SCHEMA_INVALID',
        severity: 'ERROR',
      })
    );
  });

  it('warns about permissive egress', () => {
    const warning = {
      ...validManifest,
      spec: {
        ...validManifest.spec,
        network: { ...validManifest.spec.network, egressPreset: 'DEFAULT' as const },
      },
    };
    const result = policyEngine.validate(warning);
    expect(result.valid).toBe(true); // Warning, not error
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: 'PERMISSIVE_EGRESS',
        severity: 'WARNING',
      })
    );
  });

  it('blocks empty skills allowlist at schema level', () => {
    const invalid = {
      ...validManifest,
      spec: {
        ...validManifest.spec,
        skills: { mode: 'ALLOWLIST' as const, allowlist: [] },
      },
    };
    const result = policyEngine.validate(invalid);
    expect(result.valid).toBe(false);
    // Schema validation catches this before policy engine
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: 'SCHEMA_INVALID',
        severity: 'ERROR',
      })
    );
  });

  it('blocks webhook without token verification', () => {
    const invalid = {
      ...validManifest,
      spec: {
        ...validManifest.spec,
        network: { ...validManifest.spec.network, inbound: 'WEBHOOK' as const },
        channels: [{
          type: 'webhook' as const,
          enabled: true,
          secretRef: { name: 'webhook', provider: 'aws-secrets-manager' as const, key: 'arn' },
          config: {}, // Missing verifyToken
        }],
      },
    };
    const result = policyEngine.validate(invalid);
    expect(result.valid).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: 'WEBHOOK_NO_TOKEN',
        severity: 'ERROR',
      })
    );
  });

  it('warns about channels without secrets', () => {
    const warning = {
      ...validManifest,
      spec: {
        ...validManifest.spec,
        channels: [{
          type: 'slack' as const,
          enabled: true,
          secretRef: { name: 'slack', provider: 'aws-secrets-manager' as const, key: 'arn' },
        }],
        secrets: [], // No secrets defined
      },
    };
    const result = policyEngine.validate(warning);
    expect(result.valid).toBe(true);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: 'CHANNELS_WITHOUT_SECRETS',
        severity: 'WARNING',
      })
    );
  });

  it('reports invalid secret provider at schema level', () => {
    const invalid = {
      ...validManifest,
      spec: {
        ...validManifest.spec,
        secrets: [{
          name: 'test',
          provider: 'invalid-provider',
          key: 'key',
        }],
      },
    };
    const result = policyEngine.validate(invalid);
    expect(result.valid).toBe(false);
    // Schema validation catches this before policy engine
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: 'SCHEMA_INVALID',
        severity: 'ERROR',
      })
    );
  });

  it('returns schema errors for invalid manifest', () => {
    const invalid = { invalid: 'data' };
    const result = policyEngine.validate(invalid);
    expect(result.valid).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: 'SCHEMA_INVALID',
        severity: 'ERROR',
      })
    );
  });

  it('allows webhook with token verification', () => {
    const valid = {
      ...validManifest,
      spec: {
        ...validManifest.spec,
        network: { ...validManifest.spec.network, inbound: 'WEBHOOK' as const },
        channels: [{
          type: 'webhook' as const,
          enabled: true,
          secretRef: { name: 'webhook', provider: 'aws-secrets-manager' as const, key: 'arn' },
          config: { verifyToken: true },
        }],
      },
    };
    const result = policyEngine.validate(valid);
    expect(result.valid).toBe(true);
    expect(result.violations).not.toContainEqual(
      expect.objectContaining({ code: 'WEBHOOK_NO_TOKEN' })
    );
  });

  it('allows disabling public admin check via policy', () => {
    const withDisabledCheck = {
      ...validManifest,
      spec: {
        ...validManifest.spec,
        policies: { ...validManifest.spec.policies, forbidPublicAdmin: false },
        network: { ...validManifest.spec.network, inbound: 'WEBHOOK' as const },
        channels: [{
          type: 'webhook' as const,
          enabled: true,
          secretRef: { name: 'webhook', provider: 'aws-secrets-manager' as const, key: 'arn' },
          config: {}, // No verifyToken, but check is disabled
        }],
      },
    };
    // This should be valid because forbidPublicAdmin is false
    // But the schema validation still requires verifyToken for webhooks
    const result = policyEngine.validate(withDisabledCheck);
    // The policy check is bypassed, but schema validation still applies
    expect(result.violations.some(v => v.code === 'WEBHOOK_NO_TOKEN')).toBe(false);
  });
});