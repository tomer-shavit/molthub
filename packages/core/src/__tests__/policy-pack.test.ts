import { describe, it, expect } from "vitest";
import {
  PolicyRuleType,
  PolicySeverity,
  PolicyRuleSchema,
  PolicyPackSchema,
  PolicyViolationSchema,
  BUILTIN_POLICY_PACKS,
  validatePolicyRule,
  validatePolicyPack,
} from "../policy-pack";

describe("PolicyRuleType", () => {
  const allTypes = [
    "required_field", "forbidden_field", "field_format", "field_range",
    "require_secret_manager", "forbid_public_admin", "forbid_plaintext_secrets",
    "require_image_pinning", "require_network_isolation", "forbid_wildcard_iam",
    "require_health_check", "require_observability", "resource_limits", "scaling_limits",
    "custom_json_schema", "custom_regex",
    "require_gateway_auth", "require_dm_policy", "require_config_permissions",
    "forbid_elevated_tools", "require_sandbox", "limit_tool_profile",
    "require_model_guardrails", "require_workspace_isolation", "require_port_spacing",
    "forbid_open_group_policy", "forbid_dangerous_tools", "require_gateway_host_binding",
    "require_sandbox_security_options", "require_channel_allowlist",
    "require_token_rotation", "require_skill_verification",
  ];

  it("validates all 32 rule types", () => {
    for (const type of allTypes) {
      expect(PolicyRuleType.safeParse(type).success).toBe(true);
    }
  });

  it("has exactly 32 types", () => {
    expect(PolicyRuleType.options).toHaveLength(32);
  });

  it("rejects unknown types", () => {
    expect(PolicyRuleType.safeParse("unknown_rule").success).toBe(false);
  });
});

describe("PolicySeverity", () => {
  it("accepts ERROR, WARNING, INFO", () => {
    for (const s of ["ERROR", "WARNING", "INFO"]) {
      expect(PolicySeverity.safeParse(s).success).toBe(true);
    }
  });

  it("rejects invalid severities", () => {
    expect(PolicySeverity.safeParse("CRITICAL").success).toBe(false);
  });
});

describe("PolicyRuleSchema", () => {
  function createRule(type: string, config: Record<string, unknown>) {
    return {
      id: "test-rule",
      name: "Test Rule",
      description: "A test rule",
      type,
      severity: "ERROR",
      config,
      enabled: true,
      allowOverride: false,
    };
  }

  it("validates a required_field rule", () => {
    const result = PolicyRuleSchema.safeParse(
      createRule("required_field", {
        type: "required_field",
        field: "spec.runtime.cpu",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("validates a field_format rule with regex", () => {
    const result = PolicyRuleSchema.safeParse(
      createRule("field_format", {
        type: "field_format",
        field: "spec.image",
        format: "regex",
        pattern: "^.+:.+$",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("validates a require_gateway_auth rule", () => {
    const result = PolicyRuleSchema.safeParse(
      createRule("require_gateway_auth", {
        type: "require_gateway_auth",
        enabled: true,
      }),
    );
    expect(result.success).toBe(true);
  });

  it("validates a require_sandbox rule", () => {
    const result = PolicyRuleSchema.safeParse(
      createRule("require_sandbox", {
        type: "require_sandbox",
        enabled: true,
        allowedModes: ["docker", "container"],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("validates a require_port_spacing rule", () => {
    const result = PolicyRuleSchema.safeParse(
      createRule("require_port_spacing", {
        type: "require_port_spacing",
        minimumGap: 20,
      }),
    );
    expect(result.success).toBe(true);
  });

  it("validates a custom_regex rule", () => {
    const result = PolicyRuleSchema.safeParse(
      createRule("custom_regex", {
        type: "custom_regex",
        field: "metadata.name",
        pattern: "^[a-z]+$",
        flags: "i",
        message: "Name must be lowercase",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("defaults severity to ERROR", () => {
    const result = PolicyRuleSchema.parse({
      id: "r1",
      name: "R1",
      description: "test",
      type: "require_gateway_auth",
      config: { type: "require_gateway_auth", enabled: true },
    });
    expect(result.severity).toBe("ERROR");
  });

  it("rejects rule with missing config", () => {
    const result = PolicyRuleSchema.safeParse({
      id: "r1",
      name: "R1",
      description: "test",
      type: "required_field",
    });
    expect(result.success).toBe(false);
  });
});

describe("PolicyPackSchema", () => {
  function createPack(overrides: Record<string, unknown> = {}) {
    return {
      id: "pack-1",
      name: "Test Pack",
      description: "A test policy pack",
      rules: [
        {
          id: "rule-1",
          name: "Rule 1",
          description: "Test rule",
          type: "require_gateway_auth",
          config: { type: "require_gateway_auth", enabled: true },
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "test",
      ...overrides,
    };
  }

  it("validates a minimal pack", () => {
    const result = PolicyPackSchema.safeParse(createPack());
    expect(result.success).toBe(true);
  });

  it("requires at least one rule", () => {
    const result = PolicyPackSchema.safeParse(createPack({ rules: [] }));
    expect(result.success).toBe(false);
  });

  it("defaults isBuiltin to false", () => {
    const parsed = PolicyPackSchema.parse(createPack());
    expect(parsed.isBuiltin).toBe(false);
  });

  it("defaults autoApply to false", () => {
    const parsed = PolicyPackSchema.parse(createPack());
    expect(parsed.autoApply).toBe(false);
  });

  it("defaults priority to 0", () => {
    const parsed = PolicyPackSchema.parse(createPack());
    expect(parsed.priority).toBe(0);
  });

  it("accepts targetEnvironments", () => {
    const result = PolicyPackSchema.safeParse(
      createPack({ targetEnvironments: ["prod", "staging"] }),
    );
    expect(result.success).toBe(true);
  });
});

describe("PolicyViolationSchema", () => {
  it("validates a violation", () => {
    const result = PolicyViolationSchema.safeParse({
      ruleId: "rule-1",
      ruleName: "No Open Gateway",
      severity: "ERROR",
      message: "Gateway auth is required",
      field: "gateway.auth",
    });
    expect(result.success).toBe(true);
  });

  it("allows optional fields", () => {
    const result = PolicyViolationSchema.safeParse({
      ruleId: "rule-1",
      ruleName: "Test",
      severity: "WARNING",
      message: "Something is wrong",
    });
    expect(result.success).toBe(true);
  });
});

describe("BUILTIN_POLICY_PACKS", () => {
  it("has 2 built-in packs", () => {
    expect(BUILTIN_POLICY_PACKS).toHaveLength(2);
  });

  it("Security Baseline has isBuiltin=true and isEnforced=true", () => {
    const baseline = BUILTIN_POLICY_PACKS.find(
      (p) => p.id === "builtin-security-baseline",
    );
    expect(baseline).toBeDefined();
    expect(baseline!.isBuiltin).toBe(true);
    expect(baseline!.isEnforced).toBe(true);
    expect(baseline!.autoApply).toBe(true);
  });

  it("Security Baseline has 3 rules", () => {
    const baseline = BUILTIN_POLICY_PACKS.find(
      (p) => p.id === "builtin-security-baseline",
    );
    expect(baseline!.rules).toHaveLength(3);
  });

  it("Production Guardrails targets prod environment", () => {
    const prodPack = BUILTIN_POLICY_PACKS.find(
      (p) => p.id === "builtin-production-guardrails",
    );
    expect(prodPack).toBeDefined();
    expect(prodPack!.targetEnvironments).toContain("prod");
  });

  it("Production Guardrails has 2 rules", () => {
    const prodPack = BUILTIN_POLICY_PACKS.find(
      (p) => p.id === "builtin-production-guardrails",
    );
    expect(prodPack!.rules).toHaveLength(2);
  });
});

describe("Validation helpers", () => {
  it("validatePolicyRule parses valid rule", () => {
    const rule = validatePolicyRule({
      id: "r1",
      name: "R1",
      description: "test",
      type: "require_gateway_auth",
      config: { type: "require_gateway_auth", enabled: true },
    });
    expect(rule.id).toBe("r1");
  });

  it("validatePolicyRule throws for invalid rule", () => {
    expect(() => validatePolicyRule({ id: "r1" })).toThrow();
  });

  it("validatePolicyPack parses valid pack", () => {
    const pack = validatePolicyPack({
      id: "p1",
      name: "P1",
      description: "test",
      rules: [
        {
          id: "r1",
          name: "R1",
          description: "test",
          type: "require_gateway_auth",
          config: { type: "require_gateway_auth", enabled: true },
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "test",
    });
    expect(pack.id).toBe("p1");
  });
});
