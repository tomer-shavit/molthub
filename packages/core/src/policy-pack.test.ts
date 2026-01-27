import { describe, it, expect } from 'vitest';
import {
  PolicyPackSchema,
  PolicyRuleSchema,
  PolicyEvaluationResultSchema,
  validatePolicyPack,
  validatePolicyRule,
  BUILTIN_POLICY_PACKS,
  PolicySeverity,
  PolicyRuleType,
} from './policy-pack';

describe('PolicyRule', () => {
  it('validates required_field rule', () => {
    const rule = {
      id: 'rule-1',
      name: 'Require CPU',
      description: 'CPU must be specified',
      type: 'required_field',
      severity: 'ERROR',
      config: {
        type: 'required_field',
        field: 'spec.runtime.cpu',
        message: 'CPU is required',
      },
    };
    const result = validatePolicyRule(rule);
    expect(result.type).toBe('required_field');
    expect(result.config.field).toBe('spec.runtime.cpu');
  });

  it('validates forbidden_field rule', () => {
    const rule = {
      id: 'rule-2',
      name: 'Forbid Latest Tag',
      description: 'Latest tag is not allowed',
      type: 'forbidden_field',
      severity: 'ERROR',
      config: {
        type: 'forbidden_field',
        field: 'spec.runtime.image',
      },
    };
    const result = validatePolicyRule(rule);
    expect(result.config.field).toBe('spec.runtime.image');
  });

  it('validates field_format rule', () => {
    const rule = {
      id: 'rule-3',
      name: 'Valid Image Format',
      description: 'Image must be valid format',
      type: 'field_format',
      severity: 'ERROR',
      config: {
        type: 'field_format',
        field: 'spec.runtime.image',
        format: 'regex',
        pattern: '^(?!.*:latest$).+$',
      },
    };
    const result = validatePolicyRule(rule);
    expect(result.config.format).toBe('regex');
    expect(result.config.pattern).toBe('^(?!.*:latest$).+$');
  });

  it('validates field_range rule', () => {
    const rule = {
      id: 'rule-4',
      name: 'CPU Range',
      description: 'CPU must be within range',
      type: 'field_range',
      severity: 'WARNING',
      config: {
        type: 'field_range',
        field: 'spec.runtime.cpu',
        min: 0.25,
        max: 16,
      },
    };
    const result = validatePolicyRule(rule);
    expect(result.config.min).toBe(0.25);
    expect(result.config.max).toBe(16);
  });

  it('validates security rules', () => {
    const securityRules: PolicyRuleType[] = [
      'require_secret_manager',
      'forbid_public_admin',
      'forbid_plaintext_secrets',
      'require_image_pinning',
      'require_network_isolation',
      'forbid_wildcard_iam',
      'require_health_check',
      'require_observability',
    ];
    
    for (const type of securityRules) {
      const rule = {
        id: `rule-${type}`,
        name: type,
        description: 'Security rule',
        type,
        severity: 'ERROR',
        config: { type, enabled: true },
      };
      const result = validatePolicyRule(rule);
      expect(result.type).toBe(type);
      expect(result.config.enabled).toBe(true);
    }
  });

  it('validates resource_limits rule', () => {
    const rule = {
      id: 'rule-5',
      name: 'Resource Limits',
      description: 'Enforce resource limits',
      type: 'resource_limits',
      severity: 'ERROR',
      config: {
        type: 'resource_limits',
        maxCpu: 4,
        maxMemory: 8192,
        maxReplicas: 10,
      },
    };
    const result = validatePolicyRule(rule);
    expect(result.config.maxCpu).toBe(4);
    expect(result.config.maxMemory).toBe(8192);
  });

  it('validates custom_regex rule', () => {
    const rule = {
      id: 'rule-6',
      name: 'Custom Pattern',
      description: 'Must match pattern',
      type: 'custom_regex',
      severity: 'ERROR',
      config: {
        type: 'custom_regex',
        field: 'metadata.name',
        pattern: '^[a-z0-9-]+$',
        flags: 'i',
        message: 'Name must be lowercase alphanumeric with hyphens',
      },
    };
    const result = validatePolicyRule(rule);
    expect(result.config.pattern).toBe('^[a-z0-9-]+$');
    expect(result.config.flags).toBe('i');
  });

  it('validates custom_json_schema rule', () => {
    const rule = {
      id: 'rule-7',
      name: 'Schema Validation',
      description: 'Must match schema',
      type: 'custom_json_schema',
      severity: 'ERROR',
      config: {
        type: 'custom_json_schema',
        schema: { type: 'object', properties: { name: { type: 'string' } } },
      },
    };
    const result = validatePolicyRule(rule);
    expect(result.config.schema.type).toBe('object');
  });

  it('validates rule targeting specific environments', () => {
    const rule = {
      id: 'rule-8',
      name: 'Prod Rule',
      description: 'Only for production',
      type: 'require_observability',
      severity: 'ERROR',
      targetEnvironments: ['prod'],
      config: {
        type: 'require_observability',
        enabled: true,
      },
    };
    const result = validatePolicyRule(rule);
    expect(result.targetEnvironments).toEqual(['prod']);
  });

  it('validates rule with allowOverride', () => {
    const rule = {
      id: 'rule-9',
      name: 'Optional Rule',
      description: 'Can be overridden',
      type: 'require_secret_manager',
      severity: 'WARNING',
      allowOverride: true,
      config: {
        type: 'require_secret_manager',
        enabled: true,
      },
    };
    const result = validatePolicyRule(rule);
    expect(result.allowOverride).toBe(true);
  });
});

describe('PolicyPack', () => {
  const validPolicyPack = {
    id: 'pack-123',
    name: 'Security Policies',
    description: 'Essential security policies',
    workspaceId: 'workspace-123',
    autoApply: false,
    rules: [
      {
        id: 'rule-1',
        name: 'No Latest Tag',
        description: 'Prevent latest tag',
        type: 'require_image_pinning',
        severity: 'ERROR',
        config: {
          type: 'require_image_pinning',
          enabled: true,
        },
      },
    ],
    isEnforced: false,
    priority: 100,
    version: '1.0.0',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-123',
  };

  it('validates a correct policy pack', () => {
    const result = validatePolicyPack(validPolicyPack);
    expect(result).toBeDefined();
    expect(result.name).toBe('Security Policies');
  });

  it('rejects policy pack without rules', () => {
    const invalid = { ...validPolicyPack, rules: [] };
    expect(() => validatePolicyPack(invalid)).toThrow();
  });

  it('validates builtin policy pack', () => {
    const builtin = {
      ...validPolicyPack,
      isBuiltin: true,
      workspaceId: undefined,
    };
    const result = validatePolicyPack(builtin);
    expect(result.isBuiltin).toBe(true);
  });

  it('validates autoApply with target filters', () => {
    const autoApply = {
      ...validPolicyPack,
      autoApply: true,
      targetEnvironments: ['prod', 'staging'],
      targetTags: { critical: 'true' },
    };
    const result = validatePolicyPack(autoApply);
    expect(result.autoApply).toBe(true);
    expect(result.targetEnvironments).toEqual(['prod', 'staging']);
  });

  it('validates enforced policy pack', () => {
    const enforced = { ...validPolicyPack, isEnforced: true };
    const result = validatePolicyPack(enforced);
    expect(result.isEnforced).toBe(true);
  });

  it('validates priority', () => {
    const highPriority = { ...validPolicyPack, priority: 500 };
    const result = validatePolicyPack(highPriority);
    expect(result.priority).toBe(500);
  });

  it('validates version', () => {
    const withVersion = { ...validPolicyPack, version: '2.0.0' };
    const result = validatePolicyPack(withVersion);
    expect(result.version).toBe('2.0.0');
  });

  it('validates multiple rules', () => {
    const withRules = {
      ...validPolicyPack,
      rules: [
        {
          id: 'rule-1',
          name: 'Rule 1',
          description: 'First rule',
          type: 'require_secret_manager',
          severity: 'ERROR',
          config: { type: 'require_secret_manager', enabled: true },
        },
        {
          id: 'rule-2',
          name: 'Rule 2',
          description: 'Second rule',
          type: 'forbid_public_admin',
          severity: 'ERROR',
          config: { type: 'forbid_public_admin', enabled: true },
        },
      ],
    };
    const result = validatePolicyPack(withRules);
    expect(result.rules).toHaveLength(2);
  });
});

describe('PolicyEvaluationResult', () => {
  it('validates successful evaluation', () => {
    const result = {
      packId: 'pack-123',
      packName: 'Security Policies',
      resourceId: 'bot-123',
      resourceType: 'instance',
      valid: true,
      violations: [],
      warnings: [],
      evaluatedAt: new Date(),
      evaluatedBy: 'user-123',
    };
    const validated = PolicyEvaluationResultSchema.parse(result);
    expect(validated.valid).toBe(true);
  });

  it('validates failed evaluation with violations', () => {
    const result = {
      packId: 'pack-123',
      packName: 'Security Policies',
      resourceId: 'bot-123',
      resourceType: 'instance',
      valid: false,
      violations: [
        {
          ruleId: 'rule-1',
          ruleName: 'No Latest Tag',
          severity: 'ERROR',
          message: 'Image uses latest tag',
          field: 'spec.runtime.image',
          currentValue: 'myimage:latest',
          suggestedValue: 'myimage:v1.0.0',
        },
      ],
      warnings: [],
      evaluatedAt: new Date(),
      evaluatedBy: 'user-123',
    };
    const validated = PolicyEvaluationResultSchema.parse(result);
    expect(validated.valid).toBe(false);
    expect(validated.violations).toHaveLength(1);
  });

  it('validates evaluation with warnings', () => {
    const result = {
      packId: 'pack-123',
      packName: 'Security Policies',
      resourceId: 'bot-123',
      resourceType: 'instance',
      valid: true,
      violations: [],
      warnings: [
        {
          ruleId: 'rule-2',
          ruleName: 'Consider Tracing',
          severity: 'WARNING',
          message: 'Tracing is disabled',
          field: 'spec.observability.tracing',
        },
      ],
      evaluatedAt: new Date(),
      evaluatedBy: 'user-123',
    };
    const validated = PolicyEvaluationResultSchema.parse(result);
    expect(validated.valid).toBe(true);
    expect(validated.warnings).toHaveLength(1);
  });

  it('validates all resource types', () => {
    const types = ['instance', 'fleet', 'template'] as const;
    for (const type of types) {
      const result = {
        packId: 'pack-123',
        packName: 'Security Policies',
        resourceId: 'resource-123',
        resourceType: type,
        valid: true,
        violations: [],
        warnings: [],
        evaluatedAt: new Date(),
        evaluatedBy: 'user-123',
      };
      const validated = PolicyEvaluationResultSchema.parse(result);
      expect(validated.resourceType).toBe(type);
    }
  });

  it('validates all severity levels', () => {
    const severities: PolicySeverity[] = ['ERROR', 'WARNING', 'INFO'];
    for (const severity of severities) {
      const result = {
        packId: 'pack-123',
        packName: 'Security Policies',
        resourceId: 'bot-123',
        resourceType: 'instance',
        valid: severity !== 'ERROR',
        violations: severity === 'ERROR' ? [{
          ruleId: 'rule-1',
          ruleName: 'Test Rule',
          severity,
          message: 'Test message',
        }] : [],
        warnings: [],
        evaluatedAt: new Date(),
        evaluatedBy: 'user-123',
      };
      const validated = PolicyEvaluationResultSchema.parse(result);
      if (severity === 'ERROR') {
        expect(validated.violations[0].severity).toBe(severity);
      }
    }
  });
});

describe('Builtin Policy Packs', () => {
  it('has security baseline pack', () => {
    const securityBaseline = BUILTIN_POLICY_PACKS.find(p => p.id === 'builtin-security-baseline');
    expect(securityBaseline).toBeDefined();
    expect(securityBaseline?.isBuiltin).toBe(true);
    expect(securityBaseline?.autoApply).toBe(true);
    expect(securityBaseline?.isEnforced).toBe(true);
  });

  it('has production guardrails pack', () => {
    const prodGuardrails = BUILTIN_POLICY_PACKS.find(p => p.id === 'builtin-production-guardrails');
    expect(prodGuardrails).toBeDefined();
    expect(prodGuardrails?.isBuiltin).toBe(true);
    expect(prodGuardrails?.targetEnvironments).toContain('prod');
  });

  it('security baseline has required rules', () => {
    const securityBaseline = BUILTIN_POLICY_PACKS.find(p => p.id === 'builtin-security-baseline');
    expect(securityBaseline?.rules.some(r => r.id === 'rule-no-latest')).toBe(true);
    expect(securityBaseline?.rules.some(r => r.id === 'rule-require-secrets')).toBe(true);
    expect(securityBaseline?.rules.some(r => r.id === 'rule-forbid-public-admin')).toBe(true);
  });

  it('all builtin packs have required fields', () => {
    for (const pack of BUILTIN_POLICY_PACKS) {
      expect(pack.id).toBeDefined();
      expect(pack.name).toBeDefined();
      expect(pack.rules.length).toBeGreaterThan(0);
      for (const rule of pack.rules) {
        expect(rule.id).toBeDefined();
        expect(rule.name).toBeDefined();
        expect(rule.type).toBeDefined();
        expect(rule.config).toBeDefined();
      }
    }
  });
});