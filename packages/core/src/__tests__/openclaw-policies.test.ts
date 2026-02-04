import { describe, it, expect } from "vitest";
import {
  OpenClawConfig,
  OpenClawEvaluationContext,
  evaluateOpenClawRule,
  evaluateOpenClawPolicyPack,
  OPENCLAW_SECURITY_BASELINE,
  OPENCLAW_PRODUCTION_HARDENING,
  OPENCLAW_CHANNEL_SAFETY,
  BUILTIN_OPENCLAW_POLICY_PACKS,
} from "../openclaw-policies";
import { PolicyEngine } from "../policy";

// ── Helpers ─────────────────────────────────────────────────────────────

function createBaseConfig(overrides: Partial<OpenClawConfig> = {}): OpenClawConfig {
  return {
    gateway: {
      port: 3000,
      auth: {
        token: "secure-token-123",
      },
    },
    channels: [
      { name: "slack", dmPolicy: "pairing", groupPolicy: "allowlist" },
    ],
    tools: {
      profile: "standard",
      elevated: {
        enabled: false,
      },
    },
    agents: {
      defaults: {
        sandbox: { mode: "docker" },
        workspace: "/var/openclaw/workspaces/instance-1",
        model: {
          maxTokens: 4096,
          temperature: 0.7,
        },
      },
    },
    filePermissions: {
      configFileMode: "600",
      stateDirMode: "700",
    },
    ...overrides,
  };
}

function createProdContext(overrides: Partial<OpenClawEvaluationContext> = {}): OpenClawEvaluationContext {
  return {
    environment: "prod",
    otherInstances: [],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("OpenClaw Policy Rules", () => {
  describe("require_gateway_auth", () => {
    it("passes when token auth is configured", () => {
      const config = createBaseConfig();
      const result = evaluateOpenClawRule("require_gateway_auth", config, { enabled: true });
      expect(result.passed).toBe(true);
    });

    it("passes when password auth is configured", () => {
      const config = createBaseConfig({
        gateway: { port: 3000, auth: { password: "secure-password" } },
      });
      const result = evaluateOpenClawRule("require_gateway_auth", config, { enabled: true });
      expect(result.passed).toBe(true);
    });

    it("fails when no auth is configured (missing gateway auth -> ERROR)", () => {
      const config = createBaseConfig({
        gateway: { port: 3000, auth: {} },
      });
      const result = evaluateOpenClawRule("require_gateway_auth", config, { enabled: true });
      expect(result.passed).toBe(false);
      expect(result.violation).toBeDefined();
      expect(result.violation!.severity).toBe("ERROR");
      expect(result.violation!.field).toBe("gateway.auth");
    });

    it("fails when gateway has no auth object", () => {
      const config = createBaseConfig({
        gateway: { port: 3000 },
      });
      const result = evaluateOpenClawRule("require_gateway_auth", config, { enabled: true });
      expect(result.passed).toBe(false);
    });

    it("passes when rule is disabled", () => {
      const config = createBaseConfig({
        gateway: { port: 3000 },
      });
      const result = evaluateOpenClawRule("require_gateway_auth", config, { enabled: false });
      expect(result.passed).toBe(true);
    });
  });

  describe("require_dm_policy", () => {
    it("passes with 'pairing' dm policy", () => {
      const config = createBaseConfig();
      const result = evaluateOpenClawRule("require_dm_policy", config, { forbiddenValues: ["open"] });
      expect(result.passed).toBe(true);
    });

    it("fails with 'open' dm policy in production (-> ERROR)", () => {
      const config = createBaseConfig({
        channels: [{ name: "slack", dmPolicy: "open", groupPolicy: "allowlist" }],
      });
      const result = evaluateOpenClawRule("require_dm_policy", config, { forbiddenValues: ["open"] });
      expect(result.passed).toBe(false);
      expect(result.violation).toBeDefined();
      expect(result.violation!.field).toBe("channels.dmPolicy");
      expect(result.violation!.currentValue).toBe("open");
    });

    it("fails when dmPolicy is not in allowed values", () => {
      const config = createBaseConfig({
        channels: [{ name: "slack", dmPolicy: "disabled", groupPolicy: "allowlist" }],
      });
      const result = evaluateOpenClawRule("require_dm_policy", config, {
        forbiddenValues: ["open"],
        allowedValues: ["pairing", "allowlist"],
      });
      expect(result.passed).toBe(false);
    });

    it("passes with empty channels", () => {
      const config = createBaseConfig({ channels: [] });
      const result = evaluateOpenClawRule("require_dm_policy", config, { forbiddenValues: ["open"] });
      expect(result.passed).toBe(true);
    });
  });

  describe("require_config_permissions", () => {
    it("passes with correct permissions (600/700)", () => {
      const config = createBaseConfig();
      const result = evaluateOpenClawRule("require_config_permissions", config, {
        configFileMode: "600",
        stateDirMode: "700",
      });
      expect(result.passed).toBe(true);
    });

    it("fails with wrong config file mode", () => {
      const config = createBaseConfig({
        filePermissions: { configFileMode: "644", stateDirMode: "700" },
      });
      const result = evaluateOpenClawRule("require_config_permissions", config, {
        configFileMode: "600",
        stateDirMode: "700",
      });
      expect(result.passed).toBe(false);
      expect(result.violation!.field).toBe("filePermissions.configFileMode");
    });

    it("fails with wrong state dir mode", () => {
      const config = createBaseConfig({
        filePermissions: { configFileMode: "600", stateDirMode: "755" },
      });
      const result = evaluateOpenClawRule("require_config_permissions", config, {
        configFileMode: "600",
        stateDirMode: "700",
      });
      expect(result.passed).toBe(false);
      expect(result.violation!.field).toBe("filePermissions.stateDirMode");
    });
  });

  describe("forbid_elevated_tools", () => {
    it("passes when elevated tools are disabled", () => {
      const config = createBaseConfig();
      const result = evaluateOpenClawRule("forbid_elevated_tools", config, { enabled: true });
      expect(result.passed).toBe(true);
    });

    it("passes when elevated tools have allowFrom", () => {
      const config = createBaseConfig({
        tools: {
          profile: "standard",
          elevated: { enabled: true, allowFrom: ["admin-user"] },
        },
      });
      const result = evaluateOpenClawRule("forbid_elevated_tools", config, { enabled: true });
      expect(result.passed).toBe(true);
    });

    it("fails when elevated tools enabled without allowFrom", () => {
      const config = createBaseConfig({
        tools: {
          profile: "standard",
          elevated: { enabled: true },
        },
      });
      const result = evaluateOpenClawRule("forbid_elevated_tools", config, { enabled: true });
      expect(result.passed).toBe(false);
      expect(result.violation!.severity).toBe("WARNING");
      expect(result.violation!.field).toBe("tools.elevated.allowFrom");
    });

    it("fails when elevated tools have empty allowFrom array", () => {
      const config = createBaseConfig({
        tools: {
          profile: "standard",
          elevated: { enabled: true, allowFrom: [] },
        },
      });
      const result = evaluateOpenClawRule("forbid_elevated_tools", config, { enabled: true });
      expect(result.passed).toBe(false);
    });
  });

  describe("require_sandbox", () => {
    it("passes with docker sandbox mode", () => {
      const config = createBaseConfig();
      const result = evaluateOpenClawRule("require_sandbox", config, {
        enabled: true,
        allowedModes: ["docker", "container"],
      });
      expect(result.passed).toBe(true);
    });

    it("fails with sandbox mode 'off' in production (-> ERROR)", () => {
      const config = createBaseConfig({
        agents: {
          defaults: {
            sandbox: { mode: "off" },
            workspace: "/var/openclaw/workspaces/instance-1",
            model: { maxTokens: 4096, temperature: 0.7 },
          },
        },
      });
      const result = evaluateOpenClawRule("require_sandbox", config, {
        enabled: true,
        allowedModes: ["docker", "container"],
      });
      expect(result.passed).toBe(false);
      expect(result.violation!.severity).toBe("ERROR");
      expect(result.violation!.field).toBe("agents.defaults.sandbox.mode");
    });

    it("fails when no sandbox is configured", () => {
      const config = createBaseConfig({
        agents: {
          defaults: {
            workspace: "/var/openclaw/workspaces/instance-1",
            model: { maxTokens: 4096, temperature: 0.7 },
          },
        },
      });
      const result = evaluateOpenClawRule("require_sandbox", config, {
        enabled: true,
        allowedModes: ["docker", "container"],
      });
      expect(result.passed).toBe(false);
    });

    it("passes when rule is disabled", () => {
      const config = createBaseConfig({
        agents: { defaults: { sandbox: { mode: "off" }, workspace: "/tmp", model: {} } },
      });
      const result = evaluateOpenClawRule("require_sandbox", config, { enabled: false });
      expect(result.passed).toBe(true);
    });
  });

  describe("limit_tool_profile", () => {
    it("passes with 'standard' profile", () => {
      const config = createBaseConfig();
      const result = evaluateOpenClawRule("limit_tool_profile", config, { forbiddenProfiles: ["full"] });
      expect(result.passed).toBe(true);
    });

    it("fails with 'full' tool profile in production (-> WARNING)", () => {
      const config = createBaseConfig({
        tools: { profile: "full" },
      });
      const result = evaluateOpenClawRule("limit_tool_profile", config, { forbiddenProfiles: ["full"] });
      expect(result.passed).toBe(false);
      expect(result.violation!.severity).toBe("WARNING");
      expect(result.violation!.field).toBe("tools.profile");
      expect(result.violation!.currentValue).toBe("full");
    });

    it("passes when profile is not set", () => {
      const config = createBaseConfig({
        tools: {},
      });
      const result = evaluateOpenClawRule("limit_tool_profile", config, { forbiddenProfiles: ["full"] });
      expect(result.passed).toBe(true);
    });
  });

  describe("require_model_guardrails", () => {
    it("passes with proper model configuration", () => {
      const config = createBaseConfig();
      const result = evaluateOpenClawRule("require_model_guardrails", config, {
        enabled: true,
        requireMaxTokens: true,
        requireTemperatureLimit: true,
        maxTemperature: 1.0,
      });
      expect(result.passed).toBe(true);
    });

    it("fails when maxTokens is not configured", () => {
      const config = createBaseConfig({
        agents: {
          defaults: {
            sandbox: { mode: "docker" },
            workspace: "/var/openclaw/workspaces/instance-1",
            model: { temperature: 0.7 },
          },
        },
      });
      const result = evaluateOpenClawRule("require_model_guardrails", config, {
        enabled: true,
        requireMaxTokens: true,
      });
      expect(result.passed).toBe(false);
      expect(result.violation!.field).toBe("agents.defaults.model.maxTokens");
    });

    it("fails when temperature exceeds maximum", () => {
      const config = createBaseConfig({
        agents: {
          defaults: {
            sandbox: { mode: "docker" },
            workspace: "/var/openclaw/workspaces/instance-1",
            model: { maxTokens: 4096, temperature: 1.5 },
          },
        },
      });
      const result = evaluateOpenClawRule("require_model_guardrails", config, {
        enabled: true,
        requireMaxTokens: true,
        requireTemperatureLimit: true,
        maxTemperature: 1.0,
      });
      expect(result.passed).toBe(false);
      expect(result.violation!.field).toBe("agents.defaults.model.temperature");
    });

    it("passes when rule is disabled", () => {
      const config = createBaseConfig({
        agents: { defaults: { sandbox: { mode: "off" }, workspace: "/tmp" } },
      });
      const result = evaluateOpenClawRule("require_model_guardrails", config, { enabled: false });
      expect(result.passed).toBe(true);
    });
  });

  describe("require_workspace_isolation", () => {
    it("passes with a unique workspace", () => {
      const config = createBaseConfig();
      const context = createProdContext({
        otherInstances: [
          { instanceId: "other-1", workspace: "/var/openclaw/workspaces/other-1" },
        ],
      });
      const result = evaluateOpenClawRule("require_workspace_isolation", config, { enabled: true }, context);
      expect(result.passed).toBe(true);
    });

    it("fails when workspace is not configured", () => {
      const config = createBaseConfig({
        agents: {
          defaults: {
            sandbox: { mode: "docker" },
            model: { maxTokens: 4096, temperature: 0.7 },
          },
        },
      });
      const result = evaluateOpenClawRule("require_workspace_isolation", config, { enabled: true });
      expect(result.passed).toBe(false);
      expect(result.violation!.field).toBe("agents.defaults.workspace");
    });

    it("fails when workspace duplicates another instance", () => {
      const config = createBaseConfig();
      const context = createProdContext({
        otherInstances: [
          { instanceId: "other-1", workspace: "/var/openclaw/workspaces/instance-1" },
        ],
      });
      const result = evaluateOpenClawRule("require_workspace_isolation", config, { enabled: true }, context);
      expect(result.passed).toBe(false);
      expect(result.violation!.message).toContain("other-1");
    });
  });

  describe("require_port_spacing", () => {
    it("passes with sufficient port gap", () => {
      const config = createBaseConfig({ gateway: { port: 3000, auth: { token: "t" } } });
      const context = createProdContext({
        otherInstances: [
          { instanceId: "other-1", gatewayPort: 3030 },
        ],
      });
      const result = evaluateOpenClawRule("require_port_spacing", config, { minimumGap: 20 }, context);
      expect(result.passed).toBe(true);
    });

    it("fails when port gap is less than 20", () => {
      const config = createBaseConfig({ gateway: { port: 3000, auth: { token: "t" } } });
      const context = createProdContext({
        otherInstances: [
          { instanceId: "other-1", gatewayPort: 3010 },
        ],
      });
      const result = evaluateOpenClawRule("require_port_spacing", config, { minimumGap: 20 }, context);
      expect(result.passed).toBe(false);
      expect(result.violation!.severity).toBe("ERROR");
      expect(result.violation!.message).toContain("3010");
      expect(result.violation!.message).toContain("10");
    });

    it("passes when port gap is exactly 20", () => {
      const config = createBaseConfig({ gateway: { port: 3000, auth: { token: "t" } } });
      const context = createProdContext({
        otherInstances: [
          { instanceId: "other-1", gatewayPort: 3020 },
        ],
      });
      const result = evaluateOpenClawRule("require_port_spacing", config, { minimumGap: 20 }, context);
      expect(result.passed).toBe(true);
    });

    it("passes when no other instances exist", () => {
      const config = createBaseConfig();
      const context = createProdContext({ otherInstances: [] });
      const result = evaluateOpenClawRule("require_port_spacing", config, { minimumGap: 20 }, context);
      expect(result.passed).toBe(true);
    });

    it("passes when gateway port is not set", () => {
      const config = createBaseConfig({ gateway: { auth: { token: "t" } } });
      const context = createProdContext({
        otherInstances: [{ instanceId: "other-1", gatewayPort: 3010 }],
      });
      const result = evaluateOpenClawRule("require_port_spacing", config, { minimumGap: 20 }, context);
      expect(result.passed).toBe(true);
    });
  });

  describe("forbid_open_group_policy", () => {
    it("passes with 'allowlist' group policy", () => {
      const config = createBaseConfig();
      const result = evaluateOpenClawRule("forbid_open_group_policy", config, { forbiddenValues: ["open"] });
      expect(result.passed).toBe(true);
    });

    it("fails with 'open' group policy", () => {
      const config = createBaseConfig({
        channels: [{ name: "slack", dmPolicy: "pairing", groupPolicy: "open" }],
      });
      const result = evaluateOpenClawRule("forbid_open_group_policy", config, { forbiddenValues: ["open"] });
      expect(result.passed).toBe(false);
      expect(result.violation!.field).toBe("channels.groupPolicy");
      expect(result.violation!.currentValue).toBe("open");
    });

    it("passes with no channels", () => {
      const config = createBaseConfig({ channels: [] });
      const result = evaluateOpenClawRule("forbid_open_group_policy", config, { forbiddenValues: ["open"] });
      expect(result.passed).toBe(true);
    });
  });
});

describe("evaluateOpenClawRule dispatcher", () => {
  it("dispatches require_gateway_auth correctly", () => {
    const config = createBaseConfig({ gateway: { port: 3000 } });
    const result = evaluateOpenClawRule("require_gateway_auth", config, { enabled: true });
    expect(result.passed).toBe(false);
  });

  it("dispatches require_sandbox correctly", () => {
    const config = createBaseConfig({
      agents: { defaults: { sandbox: { mode: "off" }, workspace: "/tmp", model: {} } },
    });
    const result = evaluateOpenClawRule("require_sandbox", config, {
      enabled: true,
      allowedModes: ["docker"],
    });
    expect(result.passed).toBe(false);
  });

  it("returns passed for unknown rule types", () => {
    const config = createBaseConfig();
    const result = evaluateOpenClawRule("unknown_rule", config, {});
    expect(result.passed).toBe(true);
  });
});

describe("evaluateOpenClawPolicyPack", () => {
  it("evaluates Security Baseline pack fully", () => {
    const config = createBaseConfig();
    const context = createProdContext();
    const result = evaluateOpenClawPolicyPack(
      OPENCLAW_SECURITY_BASELINE,
      "test-instance",
      config,
      context,
    );
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.packId).toBe("builtin-openclaw-security-baseline");
  });

  it("reports violations for insecure config", () => {
    const config: OpenClawConfig = {
      gateway: { port: 3000 },
      channels: [{ name: "slack", dmPolicy: "open" }],
      tools: { elevated: { enabled: true } },
    };
    const context = createProdContext();
    const result = evaluateOpenClawPolicyPack(
      OPENCLAW_SECURITY_BASELINE,
      "test-instance",
      config,
      context,
    );
    expect(result.valid).toBe(false);
    // Should find: missing gateway auth, open dmPolicy, elevated tools without allowFrom, missing workspace
    expect(result.violations.length + result.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it("evaluates Production Hardening pack for prod", () => {
    const config = createBaseConfig({
      tools: { profile: "full" },
      agents: {
        defaults: {
          sandbox: { mode: "off" },
          workspace: "/var/openclaw/workspaces/instance-1",
          model: { maxTokens: 4096, temperature: 0.7 },
        },
      },
    });
    const context = createProdContext();
    const result = evaluateOpenClawPolicyPack(
      OPENCLAW_PRODUCTION_HARDENING,
      "test-instance",
      config,
      context,
    );
    expect(result.valid).toBe(false); // sandbox off is an ERROR
    expect(result.violations.some((v) => v.ruleId === "openclaw-require-sandbox")).toBe(true);
    expect(result.warnings.some((w) => w.ruleId === "openclaw-limit-tool-profile")).toBe(true);
  });

  it("skips production rules in dev environment", () => {
    const config = createBaseConfig({
      tools: { profile: "full" },
      agents: {
        defaults: {
          sandbox: { mode: "off" },
          workspace: "/var/openclaw/workspaces/instance-1",
        },
      },
    });
    const context: OpenClawEvaluationContext = {
      environment: "dev",
      otherInstances: [],
    };
    const result = evaluateOpenClawPolicyPack(
      OPENCLAW_PRODUCTION_HARDENING,
      "test-instance",
      config,
      context,
    );
    // All rules target prod, so none should fire in dev
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe("Built-in OpenClaw Policy Packs", () => {
  it("exports three built-in packs", () => {
    expect(BUILTIN_OPENCLAW_POLICY_PACKS).toHaveLength(3);
  });

  it("Security Baseline has correct rules", () => {
    expect(OPENCLAW_SECURITY_BASELINE.rules).toHaveLength(8);
    expect(OPENCLAW_SECURITY_BASELINE.autoApply).toBe(true);
    expect(OPENCLAW_SECURITY_BASELINE.isEnforced).toBe(true);
  });

  it("Production Hardening targets prod environment", () => {
    expect(OPENCLAW_PRODUCTION_HARDENING.targetEnvironments).toEqual(["prod"]);
    expect(OPENCLAW_PRODUCTION_HARDENING.rules).toHaveLength(6);
  });

  it("Channel Safety has correct rules", () => {
    expect(OPENCLAW_CHANNEL_SAFETY.rules).toHaveLength(2);
    expect(OPENCLAW_CHANNEL_SAFETY.autoApply).toBe(true);
  });
});

describe("PolicyEngine OpenClaw integration", () => {
  it("identifies OpenClaw rule types correctly", () => {
    const engine = new PolicyEngine();
    expect(engine.isOpenClawRuleType("require_gateway_auth")).toBe(true);
    expect(engine.isOpenClawRuleType("require_dm_policy")).toBe(true);
    expect(engine.isOpenClawRuleType("require_sandbox")).toBe(true);
    expect(engine.isOpenClawRuleType("forbid_elevated_tools")).toBe(true);
    expect(engine.isOpenClawRuleType("limit_tool_profile")).toBe(true);
    expect(engine.isOpenClawRuleType("require_model_guardrails")).toBe(true);
    expect(engine.isOpenClawRuleType("require_workspace_isolation")).toBe(true);
    expect(engine.isOpenClawRuleType("require_port_spacing")).toBe(true);
    expect(engine.isOpenClawRuleType("forbid_open_group_policy")).toBe(true);
    expect(engine.isOpenClawRuleType("require_config_permissions")).toBe(true);
    // Existing types are NOT openclaw types
    expect(engine.isOpenClawRuleType("required_field")).toBe(false);
    expect(engine.isOpenClawRuleType("require_secret_manager")).toBe(false);
  });

  it("validates OpenClaw rules through the engine", () => {
    const engine = new PolicyEngine();
    const config = createBaseConfig({ gateway: { port: 3000 } });
    const result = engine.validateOpenClawRule("require_gateway_auth", config, { enabled: true });
    expect(result.passed).toBe(false);
    expect(result.violation).toBeDefined();
    expect(result.violation!.code).toBe("REQUIRE_GATEWAY_AUTH");
  });

  it("returns passed for non-openclaw rule types", () => {
    const engine = new PolicyEngine();
    const config = createBaseConfig();
    const result = engine.validateOpenClawRule("required_field", config, { field: "test" });
    expect(result.passed).toBe(true);
  });
});

describe("Fix suggestion generation", () => {
  it("suggests pairing when dm policy is open", () => {
    const config = createBaseConfig({
      channels: [{ name: "slack", dmPolicy: "open" }],
    });
    const result = evaluateOpenClawRule("require_dm_policy", config, { forbiddenValues: ["open"] });
    expect(result.passed).toBe(false);
    expect(result.violation!.suggestedValue).toBe("pairing");
  });

  it("suggests docker when sandbox is off", () => {
    const config = createBaseConfig({
      agents: {
        defaults: {
          sandbox: { mode: "off" },
          workspace: "/tmp",
          model: { maxTokens: 4096 },
        },
      },
    });
    const result = evaluateOpenClawRule("require_sandbox", config, {
      enabled: true,
      allowedModes: ["docker", "container"],
    });
    expect(result.passed).toBe(false);
    expect(result.violation!.suggestedValue).toBe("docker");
  });

  it("suggests standard when full profile is forbidden", () => {
    const config = createBaseConfig({
      tools: { profile: "full" },
    });
    const result = evaluateOpenClawRule("limit_tool_profile", config, { forbiddenProfiles: ["full"] });
    expect(result.passed).toBe(false);
    expect(result.violation!.suggestedValue).toBe("standard");
  });

  it("suggests allowlist when group policy is open", () => {
    const config = createBaseConfig({
      channels: [{ name: "slack", dmPolicy: "pairing", groupPolicy: "open" }],
    });
    const result = evaluateOpenClawRule("forbid_open_group_policy", config, { forbiddenValues: ["open"] });
    expect(result.passed).toBe(false);
    expect(result.violation!.suggestedValue).toBe("allowlist");
  });

  it("suggests correct config file permissions", () => {
    const config = createBaseConfig({
      filePermissions: { configFileMode: "644", stateDirMode: "700" },
    });
    const result = evaluateOpenClawRule("require_config_permissions", config, {
      configFileMode: "600",
      stateDirMode: "700",
    });
    expect(result.passed).toBe(false);
    expect(result.violation!.suggestedValue).toBe("600");
  });
});
