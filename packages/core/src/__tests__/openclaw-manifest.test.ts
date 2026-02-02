import { describe, it, expect } from "vitest";
import {
  OpenClawManifestSchema,
  OpenClawEnvironmentSchema,
  DeploymentTargetSchema,
  SecurityOverridesSchema,
  ClawsterSettingsSchema,
  validateOpenClawManifest,
} from "../openclaw-manifest";

function createValidManifest(overrides: Record<string, unknown> = {}) {
  return {
    apiVersion: "clawster/v2",
    kind: "OpenClawInstance",
    metadata: {
      name: "test-bot",
      workspace: "/home/user/workspace",
      environment: "dev",
      ...(overrides.metadata as Record<string, unknown> ?? {}),
    },
    spec: {
      openclawConfig: {
        gateway: { port: 18789, host: "127.0.0.1" },
        ...(overrides.openclawConfig as Record<string, unknown> ?? {}),
      },
      ...(overrides.spec as Record<string, unknown> ?? {}),
    },
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([k]) => !["metadata", "spec", "openclawConfig"].includes(k),
      ),
    ),
  };
}

describe("OpenClawManifestSchema", () => {
  it("validates a minimal valid manifest", () => {
    const result = OpenClawManifestSchema.safeParse(createValidManifest());
    expect(result.success).toBe(true);
  });

  it("requires apiVersion clawster/v2", () => {
    const result = OpenClawManifestSchema.safeParse({
      ...createValidManifest(),
      apiVersion: "clawster/v1",
    });
    expect(result.success).toBe(false);
  });

  it("requires kind OpenClawInstance", () => {
    const result = OpenClawManifestSchema.safeParse({
      ...createValidManifest(),
      kind: "SomethingElse",
    });
    expect(result.success).toBe(false);
  });

  describe("metadata.name validation", () => {
    it("accepts lowercase alphanumeric names", () => {
      const result = OpenClawManifestSchema.safeParse(
        createValidManifest({ metadata: { name: "bot1", workspace: "/ws" } }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts names with hyphens", () => {
      const result = OpenClawManifestSchema.safeParse(
        createValidManifest({ metadata: { name: "my-bot", workspace: "/ws" } }),
      );
      expect(result.success).toBe(true);
    });

    it("rejects names starting with hyphen", () => {
      const result = OpenClawManifestSchema.safeParse(
        createValidManifest({ metadata: { name: "-bot", workspace: "/ws" } }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects names ending with hyphen", () => {
      const result = OpenClawManifestSchema.safeParse(
        createValidManifest({ metadata: { name: "bot-", workspace: "/ws" } }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects uppercase names", () => {
      const result = OpenClawManifestSchema.safeParse(
        createValidManifest({ metadata: { name: "MyBot", workspace: "/ws" } }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects consecutive hyphens", () => {
      const result = OpenClawManifestSchema.safeParse(
        createValidManifest({ metadata: { name: "my--bot", workspace: "/ws" } }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects names over 63 characters", () => {
      const result = OpenClawManifestSchema.safeParse(
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
    const result = OpenClawManifestSchema.safeParse({
      ...manifest,
      metadata: { name: "bot" },
    });
    expect(result.success).toBe(false);
  });
});

describe("OpenClawEnvironmentSchema", () => {
  it("accepts dev, staging, prod, local", () => {
    for (const env of ["dev", "staging", "prod", "local"]) {
      expect(OpenClawEnvironmentSchema.safeParse(env).success).toBe(true);
    }
  });

  it("rejects invalid environments", () => {
    expect(OpenClawEnvironmentSchema.safeParse("production").success).toBe(false);
    expect(OpenClawEnvironmentSchema.safeParse("test").success).toBe(false);
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

describe("ClawsterSettingsSchema", () => {
  it("applies defaults", () => {
    const parsed = ClawsterSettingsSchema.parse({});
    expect(parsed.autoRestart).toBe(true);
    expect(parsed.healthCheckIntervalSec).toBe(30);
  });

  it("accepts all optional fields", () => {
    const result = ClawsterSettingsSchema.safeParse({
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
      ClawsterSettingsSchema.safeParse({ healthCheckIntervalSec: 0 }).success,
    ).toBe(false);
    expect(
      ClawsterSettingsSchema.safeParse({ healthCheckIntervalSec: -1 }).success,
    ).toBe(false);
  });
});

describe("validateOpenClawManifest", () => {
  it("returns parsed manifest for valid input", () => {
    const manifest = validateOpenClawManifest(createValidManifest());
    expect(manifest.apiVersion).toBe("clawster/v2");
    expect(manifest.metadata.name).toBe("test-bot");
  });

  it("throws for invalid input", () => {
    expect(() => validateOpenClawManifest({ apiVersion: "v1" })).toThrow();
  });
});
