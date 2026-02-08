import { GceTarget } from "./gce-target";
import type { GceConfig } from "./gce-config";
import type { GceManagers } from "./gce-manager-factory";
import { DeploymentTargetType } from "../../interface/deployment-target";
import type {
  IGceOperationManager,
  IGceNetworkManager,
  IGceComputeManager,
  IGceSecretManager,
  IGceLoggingManager,
} from "./managers";

// ── Mock SDK imports (prevents module-level connection attempts) ─────────

jest.mock("@google-cloud/compute", () => ({
  InstancesClient: jest.fn(),
  InstanceTemplatesClient: jest.fn(),
  InstanceGroupManagersClient: jest.fn(),
  HealthChecksClient: jest.fn(),
  NetworksClient: jest.fn(),
  SubnetworksClient: jest.fn(),
  FirewallsClient: jest.fn(),
  GlobalOperationsClient: jest.fn(),
  ZoneOperationsClient: jest.fn(),
  RegionOperationsClient: jest.fn(),
}));

jest.mock("@google-cloud/secret-manager", () => ({
  SecretManagerServiceClient: jest.fn(),
}));

jest.mock("@google-cloud/logging", () => ({
  Logging: jest.fn(),
}));

// ── Test helpers ────────────────────────────────────────────────────────

function createMockManagers(): GceManagers & {
  secretManager: IGceSecretManager;
  loggingManager: IGceLoggingManager;
} {
  const operationManager: IGceOperationManager = {
    waitForOperation: jest.fn().mockResolvedValue(undefined),
  };

  const networkManager: IGceNetworkManager = {
    ensureVpcNetwork: jest.fn().mockResolvedValue("https://compute/networks/clawster-vpc"),
    ensureSubnet: jest.fn().mockResolvedValue("https://compute/subnetworks/clawster-subnet"),
    ensureFirewall: jest.fn().mockResolvedValue(undefined),
    deleteNetwork: jest.fn().mockResolvedValue(undefined),
    deleteSubnet: jest.fn().mockResolvedValue(undefined),
    deleteFirewall: jest.fn().mockResolvedValue(undefined),
  };

  const computeManager: IGceComputeManager = {
    createInstanceTemplate: jest.fn().mockResolvedValue("https://compute/templates/clawster-tmpl-test-bot"),
    deleteInstanceTemplate: jest.fn().mockResolvedValue(undefined),
    createHealthCheck: jest.fn().mockResolvedValue("https://compute/healthChecks/clawster-hc-test-bot"),
    deleteHealthCheck: jest.fn().mockResolvedValue(undefined),
    createMig: jest.fn().mockResolvedValue(undefined),
    scaleMig: jest.fn().mockResolvedValue(undefined),
    deleteMig: jest.fn().mockResolvedValue(undefined),
    getMigInstanceIp: jest.fn().mockResolvedValue("34.120.1.1"),
    getMigStatus: jest.fn().mockResolvedValue("RUNNING" as const),
    recreateMigInstances: jest.fn().mockResolvedValue(undefined),
    setMigInstanceTemplate: jest.fn().mockResolvedValue(undefined),
    getMigInstanceTemplate: jest.fn().mockResolvedValue("https://compute/templates/clawster-tmpl-test-bot"),
    getInstanceStatus: jest.fn().mockResolvedValue("RUNNING"),
  };

  const secretManager: IGceSecretManager = {
    ensureSecret: jest.fn().mockResolvedValue(undefined),
    getSecret: jest.fn().mockResolvedValue("{}"),
    deleteSecret: jest.fn().mockResolvedValue(undefined),
    secretExists: jest.fn().mockResolvedValue(true),
  };

  const loggingManager: IGceLoggingManager = {
    getLogs: jest.fn().mockResolvedValue([]),
    getConsoleLink: jest.fn().mockReturnValue("https://console.cloud.google.com/logs"),
  };

  return { operationManager, networkManager, computeManager, secretManager, loggingManager };
}

const baseConfig: GceConfig = {
  projectId: "test-project",
  zone: "us-central1-a",
  profileName: "test-bot",
};

function createTarget(
  config: GceConfig = baseConfig,
  managers?: ReturnType<typeof createMockManagers>
) {
  const m = managers ?? createMockManagers();
  return { target: new GceTarget({ config, managers: m }), managers: m };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("GceTarget", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create a GceTarget with correct type", () => {
      const { target } = createTarget();
      expect(target.type).toBe(DeploymentTargetType.GCE);
    });

    it("should derive resource names from profileName", () => {
      const { target } = createTarget();
      const t = target as unknown as {
        instanceName: string;
        templateName: string;
        migName: string;
        healthCheckName: string;
        secretName: string;
        vpcNetworkName: string;
        subnetName: string;
        firewallHttpName: string;
        firewallSshName: string;
      };

      expect(t.instanceName).toBe("clawster-test-bot");
      expect(t.templateName).toBe("clawster-tmpl-test-bot");
      expect(t.migName).toBe("clawster-mig-test-bot");
      expect(t.healthCheckName).toBe("clawster-hc-test-bot");
      expect(t.secretName).toBe("clawster-test-bot-config");
      expect(t.vpcNetworkName).toBe("clawster-vpc");
      expect(t.subnetName).toBe("clawster-subnet");
      expect(t.firewallHttpName).toBe("clawster-fw-http-test-bot");
      expect(t.firewallSshName).toBe("clawster-fw-ssh-test-bot");
    });

    it("should use custom VPC/subnet names from config", () => {
      const { target } = createTarget({
        ...baseConfig,
        vpcNetworkName: "custom-vpc",
        subnetName: "custom-subnet",
      });
      const t = target as unknown as {
        vpcNetworkName: string;
        subnetName: string;
      };

      expect(t.vpcNetworkName).toBe("custom-vpc");
      expect(t.subnetName).toBe("custom-subnet");
    });
  });

  describe("sanitizeName", () => {
    it("should lowercase and replace invalid chars", () => {
      const { target } = createTarget();
      const t = target as unknown as { sanitizeName: (name: string) => string };

      expect(t.sanitizeName("My Bot 123")).toBe("my-bot-123");
      expect(t.sanitizeName("UPPERCASE")).toBe("uppercase");
      expect(t.sanitizeName("with_underscores")).toBe("with-underscores");
    });

    it("should collapse multiple hyphens", () => {
      const { target } = createTarget();
      const t = target as unknown as { sanitizeName: (name: string) => string };

      expect(t.sanitizeName("multiple---hyphens")).toBe("multiple-hyphens");
    });

    it("should prefix names starting with a number", () => {
      const { target } = createTarget();
      const t = target as unknown as { sanitizeName: (name: string) => string };

      expect(t.sanitizeName("123starts-with-number")).toBe("a23starts-with-number");
    });

    it("should truncate names longer than 63 characters", () => {
      const { target } = createTarget();
      const t = target as unknown as { sanitizeName: (name: string) => string };

      const longName = "a".repeat(100);
      expect(t.sanitizeName(longName).length).toBeLessThanOrEqual(63);
    });
  });

  describe("region getter", () => {
    it("should extract region from zone", () => {
      const { target } = createTarget();
      const t = target as unknown as { region: string };
      expect(t.region).toBe("us-central1");
    });

    it("should handle different zone formats", () => {
      const { target } = createTarget({ ...baseConfig, zone: "europe-west1-b" });
      const t = target as unknown as { region: string };
      expect(t.region).toBe("europe-west1");
    });
  });

  describe("install", () => {
    it("should create all resources in order and return success", async () => {
      const { target, managers } = createTarget();

      const result = await target.install({
        profileName: "test-bot",
        port: 18789,
      });

      expect(result.success).toBe(true);
      expect(result.instanceId).toBe("clawster-test-bot");
      expect(result.message).toContain("Caddy");
      expect(result.message).toContain("MIG");

      // Verify 7-step install order
      expect(managers.networkManager.ensureVpcNetwork).toHaveBeenCalledWith(
        "clawster-vpc",
        expect.objectContaining({ description: expect.any(String) })
      );
      expect(managers.networkManager.ensureSubnet).toHaveBeenCalledWith(
        "clawster-vpc",
        "clawster-subnet",
        "10.0.0.0/24"
      );
      // SECURITY: HTTP and SSH firewalls MUST be separate GCE resources
      // to prevent SSH from being exposed to 0.0.0.0/0
      expect(managers.networkManager.ensureFirewall).toHaveBeenCalledTimes(2);
      expect(managers.networkManager.ensureFirewall).toHaveBeenCalledWith(
        "clawster-fw-http-test-bot",
        "clawster-vpc",
        expect.arrayContaining([
          expect.objectContaining({ ports: ["80", "443"], sourceRanges: ["0.0.0.0/0"] }),
        ])
      );
      expect(managers.networkManager.ensureFirewall).toHaveBeenCalledWith(
        "clawster-fw-ssh-test-bot",
        "clawster-vpc",
        expect.arrayContaining([
          expect.objectContaining({ ports: ["22"], sourceRanges: ["35.235.240.0/20"] }),
        ])
      );
      expect(managers.secretManager.ensureSecret).toHaveBeenCalled();
      expect(managers.computeManager.createInstanceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "clawster-tmpl-test-bot",
          machineType: "e2-medium",
          bootDiskSizeGb: 30,
          networkTags: ["clawster-vm"],
        })
      );
      expect(managers.computeManager.createHealthCheck).toHaveBeenCalledWith(
        "clawster-hc-test-bot",
        80,
        "/health"
      );
      expect(managers.computeManager.createMig).toHaveBeenCalledWith(
        "clawster-mig-test-bot",
        expect.any(String),
        expect.any(String)
      );
    });

    it("should pull GHCR image instead of building in startup script", async () => {
      const managers = createMockManagers();
      const { target } = createTarget(baseConfig, managers);

      await target.install({ profileName: "test-bot", port: 18789 });

      const templateCall = (managers.computeManager.createInstanceTemplate as jest.Mock).mock.calls[0][0];
      const script: string = templateCall.startupScript;

      // Must pull pre-built GHCR image, not build on VM
      expect(script).toContain("docker pull");
      expect(script).toContain("ghcr.io/tomer-shavit/clawster/openclaw");
      expect(script).not.toContain("docker build");
      expect(script).not.toContain("npm install -g openclaw@");
      expect(script).not.toContain("npx -y openclaw@");
    });

    it("should return failure result on error", async () => {
      const managers = createMockManagers();
      (managers.networkManager.ensureVpcNetwork as jest.Mock).mockRejectedValue(
        new Error("VPC creation failed")
      );
      const { target } = createTarget(baseConfig, managers);

      const result = await target.install({ profileName: "test-bot", port: 18789 });

      expect(result.success).toBe(false);
      expect(result.message).toContain("VPC creation failed");
    });

    it("should use custom machine type from config", async () => {
      const { target, managers } = createTarget({
        ...baseConfig,
        machineType: "e2-standard-2",
      });

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(managers.computeManager.createInstanceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ machineType: "e2-standard-2" })
      );
    });
  });

  describe("configure", () => {
    it("should store config in Secret Manager and return requiresRestart", async () => {
      const { target, managers } = createTarget();

      const result = await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: { gateway: { auth: { token: "secret" } } },
      });

      expect(result.success).toBe(true);
      expect(result.requiresRestart).toBe(true);
      expect(result.message).toContain("Secret Manager");
      expect(managers.secretManager.ensureSecret).toHaveBeenCalled();
    });

    it("should transform gateway config correctly", async () => {
      const managers = createMockManagers();
      let capturedConfig = "";
      (managers.secretManager.ensureSecret as jest.Mock).mockImplementation(
        (_name: string, value: string) => {
          capturedConfig = value;
          return Promise.resolve();
        }
      );
      const { target } = createTarget(baseConfig, managers);

      await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {
          gateway: {
            port: 12345,
            host: "localhost",
            auth: { token: "secret" },
          },
        },
      });

      const parsed = JSON.parse(capturedConfig);

      // bind should be "lan", host/port deleted
      expect(parsed.gateway.bind).toBe("lan");
      expect(parsed.gateway.port).toBeUndefined();
      expect(parsed.gateway.host).toBeUndefined();
      expect(parsed.gateway.auth).toEqual({ token: "secret" });

      // trustedProxies should be set for Docker bridge
      expect(parsed.gateway.trustedProxies).toEqual(["172.16.0.0/12"]);
    });

    it("should transform sandbox config to agents.defaults.sandbox", async () => {
      const managers = createMockManagers();
      let capturedConfig = "";
      (managers.secretManager.ensureSecret as jest.Mock).mockImplementation(
        (_name: string, value: string) => {
          capturedConfig = value;
          return Promise.resolve();
        }
      );
      const { target } = createTarget(baseConfig, managers);

      await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {
          sandbox: { mode: "off" },
          channels: {
            telegram: {
              enabled: true,
              botToken: "token",
            },
          },
        },
      });

      const parsed = JSON.parse(capturedConfig);

      // sandbox moved to agents.defaults.sandbox
      expect(parsed.sandbox).toBeUndefined();
      expect(parsed.agents?.defaults?.sandbox).toEqual({ mode: "off" });

      // channels.*.enabled deleted
      expect(parsed.channels?.telegram?.enabled).toBeUndefined();
      expect(parsed.channels?.telegram?.botToken).toBe("token");
    });

    it("should return failure on Secret Manager error", async () => {
      const managers = createMockManagers();
      (managers.secretManager.ensureSecret as jest.Mock).mockRejectedValue(
        new Error("Secret write failed")
      );
      const { target } = createTarget(baseConfig, managers);

      const result = await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {},
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Secret write failed");
    });
  });

  describe("getStatus", () => {
    it("should return running when MIG status is RUNNING", async () => {
      const { target } = createTarget();
      const status = await target.getStatus();
      expect(status.state).toBe("running");
    });

    it("should return stopped when MIG status is STOPPED", async () => {
      const managers = createMockManagers();
      (managers.computeManager.getMigStatus as jest.Mock).mockResolvedValue("STOPPED");
      const { target } = createTarget(baseConfig, managers);

      const status = await target.getStatus();
      expect(status.state).toBe("stopped");
    });

    it("should return running for UNKNOWN/transitional MIG status", async () => {
      const managers = createMockManagers();
      (managers.computeManager.getMigStatus as jest.Mock).mockResolvedValue("UNKNOWN");
      const { target } = createTarget(baseConfig, managers);

      const status = await target.getStatus();
      expect(status.state).toBe("running"); // transitional = provisioning
    });

    it("should return not-installed when MIG not found", async () => {
      const managers = createMockManagers();
      (managers.computeManager.getMigStatus as jest.Mock).mockRejectedValue(
        new Error("NOT_FOUND: MIG does not exist")
      );
      const { target } = createTarget(baseConfig, managers);

      const status = await target.getStatus();
      expect(status.state).toBe("not-installed");
    });

    it("should return error for non-404 errors", async () => {
      const managers = createMockManagers();
      (managers.computeManager.getMigStatus as jest.Mock).mockRejectedValue(
        new Error("Permission denied")
      );
      const { target } = createTarget(baseConfig, managers);

      const status = await target.getStatus();
      expect(status.state).toBe("error");
      expect(status.error).toContain("Permission denied");
    });
  });

  describe("getEndpoint", () => {
    it("should return ephemeral IP with HTTP when no custom domain", async () => {
      const { target } = createTarget();

      const endpoint = await target.getEndpoint();

      expect(endpoint.host).toBe("34.120.1.1");
      expect(endpoint.port).toBe(80);
      expect(endpoint.protocol).toBe("ws");
    });

    it("should return custom domain with HTTPS when configured", async () => {
      const { target } = createTarget({
        ...baseConfig,
        customDomain: "bot.example.com",
      });

      const endpoint = await target.getEndpoint();

      expect(endpoint.host).toBe("bot.example.com");
      expect(endpoint.port).toBe(443);
      expect(endpoint.protocol).toBe("wss");
    });

    it("should throw when no public IP available", async () => {
      const managers = createMockManagers();
      (managers.computeManager.getMigInstanceIp as jest.Mock).mockResolvedValue("");
      const { target } = createTarget(baseConfig, managers);

      await expect(target.getEndpoint()).rejects.toThrow("No public IP available");
    });

    it("should cache the public IP after first call", async () => {
      const { target, managers } = createTarget();

      await target.getEndpoint();
      await target.getEndpoint();

      // Should only fetch IP once
      expect(managers.computeManager.getMigInstanceIp).toHaveBeenCalledTimes(1);
    });
  });

  describe("start", () => {
    it("should scale MIG to 1", async () => {
      const { target, managers } = createTarget();
      await target.start();

      expect(managers.computeManager.scaleMig).toHaveBeenCalledWith(
        "clawster-mig-test-bot",
        1
      );
    });
  });

  describe("stop", () => {
    it("should scale MIG to 0", async () => {
      const { target, managers } = createTarget();
      await target.stop();

      expect(managers.computeManager.scaleMig).toHaveBeenCalledWith(
        "clawster-mig-test-bot",
        0
      );
    });

    it("should clear cached public IP", async () => {
      const { target } = createTarget();

      // Fetch IP first
      await target.getEndpoint();

      // Stop clears cache
      await target.stop();

      // Next getEndpoint should re-fetch
      await target.getEndpoint();

      const t = target as unknown as { cachedPublicIp: string };
      expect(t.cachedPublicIp).toBe("34.120.1.1");
    });
  });

  describe("restart", () => {
    it("should recreate MIG instances", async () => {
      const { target, managers } = createTarget();
      await target.restart();

      expect(managers.computeManager.recreateMigInstances).toHaveBeenCalledWith(
        "clawster-mig-test-bot"
      );
    });

    it("should clear cached public IP", async () => {
      const { target, managers } = createTarget();

      await target.getEndpoint();
      await target.restart();

      // Should re-fetch IP on next call
      await target.getEndpoint();
      expect(managers.computeManager.getMigInstanceIp).toHaveBeenCalledTimes(2);
    });
  });

  describe("getLogs", () => {
    it("should delegate to loggingManager", async () => {
      const managers = createMockManagers();
      (managers.loggingManager.getLogs as jest.Mock).mockResolvedValue([
        "Log line 1",
        "Log line 2",
      ]);
      const { target } = createTarget(baseConfig, managers);

      const logs = await target.getLogs({ lines: 10 });

      expect(logs).toEqual(["Log line 1", "Log line 2"]);
      expect(managers.loggingManager.getLogs).toHaveBeenCalledWith(
        "clawster-test-bot",
        "us-central1-a",
        expect.objectContaining({ lines: 10 })
      );
    });

    it("should pass filter option", async () => {
      const { target, managers } = createTarget();

      await target.getLogs({ filter: "error" });

      expect(managers.loggingManager.getLogs).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ filter: "error" })
      );
    });
  });

  describe("destroy", () => {
    it("should delete resources in correct order", async () => {
      const managers = createMockManagers();
      const deleteOrder: string[] = [];

      (managers.computeManager.deleteMig as jest.Mock).mockImplementation(() => {
        deleteOrder.push("mig");
        return Promise.resolve();
      });
      (managers.computeManager.deleteHealthCheck as jest.Mock).mockImplementation(() => {
        deleteOrder.push("health-check");
        return Promise.resolve();
      });
      (managers.computeManager.deleteInstanceTemplate as jest.Mock).mockImplementation(() => {
        deleteOrder.push("template");
        return Promise.resolve();
      });
      (managers.networkManager.deleteFirewall as jest.Mock).mockImplementation((name: string) => {
        deleteOrder.push(name.includes("http") ? "firewall-http" : "firewall-ssh");
        return Promise.resolve();
      });
      (managers.secretManager.deleteSecret as jest.Mock).mockImplementation(() => {
        deleteOrder.push("secret");
        return Promise.resolve();
      });

      const { target } = createTarget(baseConfig, managers);
      await target.destroy();

      // Verify order: MIG → Health Check → Template → HTTP FW → SSH FW → Secret
      expect(deleteOrder).toEqual([
        "mig",
        "health-check",
        "template",
        "firewall-http",
        "firewall-ssh",
        "secret",
      ]);
    });

    it("should not throw when secret is not found", async () => {
      const managers = createMockManagers();
      (managers.secretManager.deleteSecret as jest.Mock).mockRejectedValue(
        new Error("NOT_FOUND")
      );
      const { target } = createTarget(baseConfig, managers);

      await expect(target.destroy()).resolves.not.toThrow();
    });

    it("should preserve VPC and subnet (not deleted)", async () => {
      const { target, managers } = createTarget();
      await target.destroy();

      expect(managers.networkManager.deleteNetwork).not.toHaveBeenCalled();
      expect(managers.networkManager.deleteSubnet).not.toHaveBeenCalled();
    });
  });

  describe("updateResources", () => {
    it("should swap templates and return success", async () => {
      const { target, managers } = createTarget();

      const result = await target.updateResources({
        cpu: 2048,
        memory: 8192,
        dataDiskSizeGb: 0,
      });

      expect(result.success).toBe(true);
      expect(result.requiresRestart).toBe(true);
      expect(result.message).toContain("e2-standard-2");

      // Verify 5-step flow
      expect(managers.computeManager.scaleMig).toHaveBeenCalledWith("clawster-mig-test-bot", 0);
      expect(managers.computeManager.getMigInstanceTemplate).toHaveBeenCalled();
      expect(managers.computeManager.createInstanceTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ machineType: "e2-standard-2" })
      );
      expect(managers.computeManager.setMigInstanceTemplate).toHaveBeenCalled();
      expect(managers.computeManager.deleteInstanceTemplate).toHaveBeenCalled();
    });

    it("should attempt recovery on failure", async () => {
      const managers = createMockManagers();
      (managers.computeManager.createInstanceTemplate as jest.Mock).mockRejectedValueOnce(
        new Error("Template creation failed")
      );
      const { target } = createTarget(baseConfig, managers);

      const result = await target.updateResources({
        cpu: 2048,
        memory: 4096,
        dataDiskSizeGb: 0,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Template creation failed");

      // Should attempt to scale back to 1
      expect(managers.computeManager.scaleMig).toHaveBeenCalledWith("clawster-mig-test-bot", 1);
    });
  });

  describe("getResources", () => {
    it("should return current machine spec", async () => {
      const { target } = createTarget();
      const spec = await target.getResources();
      expect(spec).toEqual({ cpu: 2048, memory: 4096, dataDiskSizeGb: 0 });
    });

    it("should reflect updated machine type after updateResources", async () => {
      const { target } = createTarget();

      await target.updateResources({ cpu: 2048, memory: 8192, dataDiskSizeGb: 0 });

      const spec = await target.getResources();
      expect(spec).toEqual({ cpu: 2048, memory: 8192, dataDiskSizeGb: 0 });
    });

    it("should return performance spec for e2-standard-2 config", async () => {
      const { target } = createTarget({ ...baseConfig, machineType: "e2-standard-2" });
      const spec = await target.getResources();
      expect(spec).toEqual({ cpu: 2048, memory: 8192, dataDiskSizeGb: 0 });
    });
  });

  describe("getMetadata", () => {
    it("should return correct metadata", () => {
      const { target } = createTarget();
      const metadata = target.getMetadata();

      expect(metadata.type).toBe(DeploymentTargetType.GCE);
      expect(metadata.displayName).toBe("Google Compute Engine");
      expect(metadata.capabilities.sandbox).toBe(true);
      expect(metadata.capabilities.persistentStorage).toBe(false);
      expect(metadata.provisioningSteps.length).toBeGreaterThan(0);
      expect(metadata.tierSpecs).toHaveProperty("light");
      expect(metadata.tierSpecs).toHaveProperty("standard");
      expect(metadata.tierSpecs).toHaveProperty("performance");
    });

    it("should have correct tier specs", () => {
      const { target } = createTarget();
      const metadata = target.getMetadata();

      // light = standard = e2-medium (no e2-small — OOMs)
      expect(metadata.tierSpecs!.light.machineType).toBe("e2-medium");
      expect(metadata.tierSpecs!.standard.machineType).toBe("e2-medium");
      expect(metadata.tierSpecs!.performance.machineType).toBe("e2-standard-2");
    });
  });
});
