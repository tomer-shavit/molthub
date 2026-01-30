import { describe, it, expect } from "vitest";
import {
  MoltbotManifestSchema,
  MoltbotEnvironmentSchema,
  DeploymentTargetSchema,
  SecurityOverridesSchema,
  MolthubSettingsSchema,
  validateMoltbotManifest,
} from "../moltbot-manifest";

function createValidManifest(overrides: Record<string, unknown> = {}) {
  return {
    apiVersion: "molthub/v2",
    kind: "MoltbotInstance",
    metadata: {
      name: "test-bot",
      workspace: "/home/user/workspace",
      environment: "dev",
      ...(overrides.metadata as Record<string, unknown> ?? {}),
    },
    spec: {
      moltbotConfig: {
        gateway: { port: 18789, host: "127.0.0.1" },
        ...(overrides.moltbotConfig as Record<string, unknown> ?? {}),
      },
      ...(overrides.spec as Record<string, unknown> ?? {}),
    },
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([k]) => !["metadata", "spec", "moltbotConfig"].includes(k),
      ),
    ),
  };
}

describe("MoltbotManifestSchema", () => {
  it("validates a minimal valid manifest", () => {
    const result = MoltbotManifestSchema.safeParse(createValidManifest());
    expect(result.success).toBe(true);
  });

  it("requires apiVersion molthub/v2", () => {
    const result = MoltbotManifestSchema.safeParse({
      ...createValidManifest(),
      apiVersion: "molthub/v1",
    });
    expect(result.success).toBe(false);
  });

  it("requires kind MoltbotInstance", () => {
    const result = MoltbotManifestSchema.safeParse({
      ...createValidManifest(),
      kind: "SomethingElse",
    });
    expect(result.success).toBe(false);
  });

  describe("metadata.name validation", () => {
    it("accepts lowercase alphanumeric names", () => {
      const result = MoltbotManifestSchema.safeParse(
        createValidManifest({ metadata: { name: "bot1", workspace: "/ws" } }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts names with hyphens", () => {
      const result = MoltbotManifestSchema.safeParse(
        createValidManifest({ metadata: { name: "my-bot", workspace: "/ws" } }),
      );
      expect(result.success).toBe(true);
    });

    it("rejects names starting with hyphen", () => {
      const result = MoltbotManifestSchema.safeParse(
        createValidManifest({ metadata: { name: "-bot", workspace: "/ws" } }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects names ending with hyphen", () => {
      const result = MoltbotManifestSchema.safeParse(
        createValidManifest({ metadata: { name: "bot-", workspace: "/ws" } }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects uppercase names", () => {
      const result = MoltbotManifestSchema.safeParse(
        createValidManifest({ metadata: { name: "MyBot", workspace: "/ws" } }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects consecutive hyphens", () => {
      const result = MoltbotManifestSchema.safeParse(
        createValidManifest({ metadata: { name: "my--bot", workspace: "/ws" } }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects names over 63 characters", () => {
      const result = MoltbotManifestSchema.safeParse(
        createValidManifest({
          metadata: { name: "a".repeat(64), workspace: "/ws" },
        }),
      );
      expect(result.success).toBe(false);
    });
  });

  it("requires metadata.workspace", () => {
    const manifest = createValidManifest();
    delete (manifest as Record<string, unknown>).metadata;
    const result = MoltbotManifestSchema.safeParse({
      ...manifest,
      metadata: { name: "bot" },
    });
    expect(result.success).toBe(false);
  });
});

describe("MoltbotEnvironmentSchema", () => {
  it("accepts dev, staging, prod, local", () => {
    for (const env of ["dev", "staging", "prod", "local"]) {
      expect(MoltbotEnvironmentSchema.safeParse(env).success).toBe(true);
    }
  });

  it("rejects invalid environments", () => {
    expect(MoltbotEnvironmentSchema.safeParse("production").success).toBe(false);
    expect(MoltbotEnvironmentSchema.safeParse("test").success).toBe(false);
  });
});

describe("DeploymentTargetSchema", () => {
  it("accepts all valid targets", () => {
    for (const target of ["local", "docker", "ecs", "kubernetes", "fly"]) {
      expect(DeploymentTargetSchema.safeParse(target).success).toBe(true);
    }
  });

  it("rejects invalid targets", () => {
    expect(DeploymentTargetSchema.safeParse("heroku").success).toBe(false);
    expect(DeploymentTargetSchema.safeParse("aws").success).toBe(false);
  });
});

describe("SecurityOverridesSchema", () => {
  it("applies defaults (all false)", () => {
    const parsed = SecurityOverridesSchema.parse({});
    expect(parsed.allowOpenGateway).toBe(false);
    expect(parsed.allowSandboxOff).toBe(false);
    expect(parsed.allowOpenDmPolicy).toBe(false);
  });

  it("accepts explicit overrides", () => {
    const parsed = SecurityOverridesSchema.parse({
      allowOpenGateway: true,
      allowSandboxOff: true,
    });
    expect(parsed.allowOpenGateway).toBe(true);
    expect(parsed.allowSandboxOff).toBe(true);
    expect(parsed.allowOpenDmPolicy).toBe(false);
  });
});

describe("MolthubSettingsSchema", () => {
  it("applies defaults", () => {
    const parsed = MolthubSettingsSchema.parse({});
    expect(parsed.autoRestart).toBe(true);
    expect(parsed.healthCheckIntervalSec).toBe(30);
  });

  it("accepts all optional fields", () => {
    const result = MolthubSettingsSchema.safeParse({
      fleetId: "fleet-1",
      templateId: "tmpl-1",
      enforcedPolicyPackIds: ["pack-1"],
      autoRestart: false,
      healthCheckIntervalSec: 60,
      tags: { env: "prod" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-positive healthCheckIntervalSec", () => {
    expect(
      MolthubSettingsSchema.safeParse({ healthCheckIntervalSec: 0 }).success,
    ).toBe(false);
    expect(
      MolthubSettingsSchema.safeParse({ healthCheckIntervalSec: -1 }).success,
    ).toBe(false);
  });
});

describe("validateMoltbotManifest", () => {
  it("returns parsed manifest for valid input", () => {
    const manifest = validateMoltbotManifest(createValidManifest());
    expect(manifest.apiVersion).toBe("molthub/v2");
    expect(manifest.metadata.name).toBe("test-bot");
  });

  it("throws for invalid input", () => {
    expect(() => validateMoltbotManifest({ apiVersion: "v1" })).toThrow();
  });
});
