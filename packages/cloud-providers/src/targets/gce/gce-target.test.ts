import { GceTarget } from "./gce-target";
import type { GceConfig } from "./gce-config";
import { DeploymentTargetType } from "../../interface/deployment-target";

// Mock all GCP SDK clients
jest.mock("@google-cloud/compute", () => ({
  InstancesClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
    setMetadata: jest.fn(),
  })),
  DisksClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  })),
  NetworksClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
  })),
  SubnetworksClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
  })),
  FirewallsClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  })),
  GlobalAddressesClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  })),
  BackendServicesClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  })),
  UrlMapsClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  })),
  TargetHttpProxiesClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  })),
  TargetHttpsProxiesClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  })),
  GlobalForwardingRulesClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  })),
  InstanceGroupsClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
    addInstances: jest.fn(),
  })),
  SecurityPoliciesClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  })),
  GlobalOperationsClient: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue([{ status: "DONE" }]),
  })),
  ZoneOperationsClient: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue([{ status: "DONE" }]),
  })),
  RegionOperationsClient: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue([{ status: "DONE" }]),
  })),
}));

jest.mock("@google-cloud/secret-manager", () => ({
  SecretManagerServiceClient: jest.fn().mockImplementation(() => ({
    getSecret: jest.fn(),
    createSecret: jest.fn(),
    addSecretVersion: jest.fn(),
    deleteSecret: jest.fn(),
  })),
}));

jest.mock("@google-cloud/logging", () => ({
  Logging: jest.fn().mockImplementation(() => ({
    log: jest.fn().mockReturnValue({
      getEntries: jest.fn().mockResolvedValue([[]]),
    }),
  })),
}));

describe("GceTarget", () => {
  const baseConfig: GceConfig = {
    projectId: "test-project",
    zone: "us-central1-a",
    profileName: "test-bot",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create a GceTarget with default values", () => {
      const target = new GceTarget(baseConfig);

      expect(target.type).toBe(DeploymentTargetType.GCE);
    });

    it("should derive resource names from profileName", () => {
      const target = new GceTarget(baseConfig);

      // Access private properties via type assertion for testing
      const targetAny = target as unknown as {
        instanceName: string;
        dataDiskName: string;
        secretName: string;
        vpcNetworkName: string;
      };

      expect(targetAny.instanceName).toBe("clawster-test-bot");
      expect(targetAny.dataDiskName).toBe("clawster-data-test-bot");
      expect(targetAny.secretName).toBe("clawster-test-bot-config");
      expect(targetAny.vpcNetworkName).toBe("clawster-vpc-test-bot");
    });

    it("should use custom values from config when provided", () => {
      const customConfig: GceConfig = {
        ...baseConfig,
        machineType: "n1-standard-2",
        bootDiskSizeGb: 50,
        dataDiskSizeGb: 20,
        vpcNetworkName: "custom-vpc",
      };

      const target = new GceTarget(customConfig);
      const targetAny = target as unknown as {
        machineType: string;
        bootDiskSizeGb: number;
        dataDiskSizeGb: number;
        vpcNetworkName: string;
      };

      expect(targetAny.machineType).toBe("n1-standard-2");
      expect(targetAny.bootDiskSizeGb).toBe(50);
      expect(targetAny.dataDiskSizeGb).toBe(20);
      expect(targetAny.vpcNetworkName).toBe("custom-vpc");
    });
  });

  describe("sanitizeName", () => {
    it("should sanitize names for GCP resources", () => {
      const target = new GceTarget(baseConfig);
      const targetAny = target as unknown as {
        sanitizeName: (name: string) => string;
      };

      expect(targetAny.sanitizeName("My Bot 123")).toBe("my-bot-123");
      expect(targetAny.sanitizeName("UPPERCASE")).toBe("uppercase");
      expect(targetAny.sanitizeName("with_underscores")).toBe("with-underscores");
      expect(targetAny.sanitizeName("multiple---hyphens")).toBe("multiple-hyphens");
      expect(targetAny.sanitizeName("123starts-with-number")).toBe("a23starts-with-number");
    });

    it("should truncate names longer than 63 characters", () => {
      const target = new GceTarget(baseConfig);
      const targetAny = target as unknown as {
        sanitizeName: (name: string) => string;
      };

      const longName = "a".repeat(100);
      expect(targetAny.sanitizeName(longName).length).toBeLessThanOrEqual(63);
    });
  });

  describe("region getter", () => {
    it("should extract region from zone", () => {
      const target = new GceTarget(baseConfig);
      const targetAny = target as unknown as {
        region: string;
      };

      expect(targetAny.region).toBe("us-central1");
    });

    it("should handle different zone formats", () => {
      const target = new GceTarget({
        ...baseConfig,
        zone: "europe-west1-b",
      });
      const targetAny = target as unknown as {
        region: string;
      };

      expect(targetAny.region).toBe("europe-west1");
    });
  });

  describe("install", () => {
    it("should return success result on successful install", async () => {
      // Create target first - this instantiates all the SDK clients
      const target = new GceTarget(baseConfig);

      // Now get references to the mock SDK clients
      const {
        NetworksClient,
        SubnetworksClient,
        FirewallsClient,
        GlobalAddressesClient,
        DisksClient,
        InstancesClient,
        InstanceGroupsClient,
        BackendServicesClient,
        UrlMapsClient,
        TargetHttpProxiesClient,
        GlobalForwardingRulesClient,
      } = jest.requireMock("@google-cloud/compute");
      const { SecretManagerServiceClient } = jest.requireMock("@google-cloud/secret-manager");

      // Find the mock instances created for this target (last created instances)
      const secretClient = SecretManagerServiceClient.mock.results.at(-1)?.value;
      const networksClient = NetworksClient.mock.results.at(-1)?.value;
      const subnetworksClient = SubnetworksClient.mock.results.at(-1)?.value;
      const firewallsClient = FirewallsClient.mock.results.at(-1)?.value;
      const addressesClient = GlobalAddressesClient.mock.results.at(-1)?.value;
      const disksClient = DisksClient.mock.results.at(-1)?.value;
      const instancesClient = InstancesClient.mock.results.at(-1)?.value;
      const instanceGroupsClient = InstanceGroupsClient.mock.results.at(-1)?.value;
      const backendServicesClient = BackendServicesClient.mock.results.at(-1)?.value;
      const urlMapsClient = UrlMapsClient.mock.results.at(-1)?.value;
      const httpProxiesClient = TargetHttpProxiesClient.mock.results.at(-1)?.value;
      const forwardingRulesClient = GlobalForwardingRulesClient.mock.results.at(-1)?.value;

      // Mock secret manager
      secretClient.getSecret.mockRejectedValue(new Error("NOT_FOUND"));
      secretClient.createSecret.mockResolvedValue([{}]);
      secretClient.addSecretVersion.mockResolvedValue([{}]);

      // Mock network resources - first call NOT_FOUND, second call after insert succeeds
      networksClient.get
        .mockRejectedValueOnce(new Error("NOT_FOUND"))
        .mockResolvedValue([{ selfLink: "http://..." }]);
      networksClient.insert.mockResolvedValue([{ name: "op-1" }]);

      subnetworksClient.get
        .mockRejectedValueOnce(new Error("NOT_FOUND"))
        .mockResolvedValue([{ selfLink: "http://..." }]);
      subnetworksClient.insert.mockResolvedValue([{ name: "op-1" }]);

      firewallsClient.get.mockRejectedValue(new Error("NOT_FOUND"));
      firewallsClient.insert.mockResolvedValue([{ name: "op-1" }]);

      addressesClient.get
        .mockRejectedValueOnce(new Error("NOT_FOUND"))
        .mockResolvedValue([{ address: "1.2.3.4" }]);
      addressesClient.insert.mockResolvedValue([{ name: "op-1" }]);

      // Mock compute resources - first call NOT_FOUND (for checking), no need for second call
      disksClient.get.mockRejectedValue(new Error("NOT_FOUND"));
      disksClient.insert.mockResolvedValue([{ name: "op-1" }]);

      instancesClient.insert.mockResolvedValue([{ name: "op-1" }]);
      instancesClient.get.mockResolvedValue([{ selfLink: "http://..." }]);

      instanceGroupsClient.get
        .mockRejectedValueOnce(new Error("NOT_FOUND"))
        .mockResolvedValue([{ selfLink: "http://..." }]);
      instanceGroupsClient.insert.mockResolvedValue([{ name: "op-1" }]);
      instanceGroupsClient.addInstances.mockResolvedValue([{ name: "op-1" }]);

      // Mock load balancer resources
      backendServicesClient.get
        .mockRejectedValueOnce(new Error("NOT_FOUND"))
        .mockResolvedValue([{ selfLink: "http://..." }]);
      backendServicesClient.insert.mockResolvedValue([{ name: "op-1" }]);

      urlMapsClient.get
        .mockRejectedValueOnce(new Error("NOT_FOUND"))
        .mockResolvedValue([{ selfLink: "http://..." }]);
      urlMapsClient.insert.mockResolvedValue([{ name: "op-1" }]);

      httpProxiesClient.get
        .mockRejectedValueOnce(new Error("NOT_FOUND"))
        .mockResolvedValue([{ selfLink: "http://..." }]);
      httpProxiesClient.insert.mockResolvedValue([{ name: "op-1" }]);

      forwardingRulesClient.get
        .mockRejectedValueOnce(new Error("NOT_FOUND"))
        .mockResolvedValue([{ selfLink: "http://..." }]);
      forwardingRulesClient.insert.mockResolvedValue([{ name: "op-1" }]);

      const result = await target.install({
        profileName: "test-bot",
        port: 18789,
      });

      expect(result.success).toBe(true);
      expect(result.instanceId).toBe("clawster-test-bot");
      expect(result.message).toContain("GCE VM");
      expect(result.message).toContain("persistent disk");
    });

    it("should return failure result on error", async () => {
      const target = new GceTarget(baseConfig);

      const { SecretManagerServiceClient } = jest.requireMock("@google-cloud/secret-manager");
      const secretClient = SecretManagerServiceClient.mock.results.at(-1)?.value;

      // Mock secret manager to fail
      secretClient.getSecret.mockRejectedValue(new Error("NOT_FOUND"));
      secretClient.createSecret.mockRejectedValue(new Error("Secret creation failed"));

      const result = await target.install({
        profileName: "test-bot",
        port: 18789,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Secret creation failed");
    });
  });

  describe("configure", () => {
    it("should transform config correctly", async () => {
      const target = new GceTarget(baseConfig);

      const { SecretManagerServiceClient } = jest.requireMock("@google-cloud/secret-manager");
      const { InstancesClient } = jest.requireMock("@google-cloud/compute");

      const secretClient = SecretManagerServiceClient.mock.results.at(-1)?.value;
      const instancesClient = InstancesClient.mock.results.at(-1)?.value;

      // Capture config passed to secret manager
      let capturedConfig: string | undefined;
      secretClient.getSecret.mockResolvedValue([{}]);
      secretClient.addSecretVersion.mockImplementation(
        ({ payload }: { payload: { data: Buffer } }) => {
          capturedConfig = payload.data.toString("utf8");
          return Promise.resolve([{}]);
        }
      );

      // Mock VM metadata update
      instancesClient.get.mockResolvedValue([
        { metadata: { items: [], fingerprint: "abc" } },
      ]);
      instancesClient.setMetadata.mockResolvedValue([{ name: "op-1" }]);

      await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {
          gateway: {
            port: 12345, // Should be deleted
            host: "localhost", // Should be replaced with bind: "lan"
            auth: { token: "secret" },
          },
          sandbox: { mode: "off" }, // Should move to agents.defaults.sandbox
          channels: {
            telegram: {
              enabled: true, // Should be deleted
              botToken: "token",
            },
          },
          skills: {
            allowUnverified: true, // Should be deleted
            allowBundled: ["github"],
          },
        },
      });

      expect(capturedConfig).toBeDefined();
      const parsed = JSON.parse(capturedConfig!);

      // gateway.bind should be "lan", port/host should be deleted
      expect(parsed.gateway.bind).toBe("lan");
      expect(parsed.gateway.port).toBeUndefined();
      expect(parsed.gateway.host).toBeUndefined();
      expect(parsed.gateway.auth).toEqual({ token: "secret" });

      // sandbox should be moved to agents.defaults.sandbox
      expect(parsed.sandbox).toBeUndefined();
      expect(parsed.agents.defaults.sandbox).toEqual({ mode: "off" });

      // channels.*.enabled should be deleted
      expect(parsed.channels.telegram.enabled).toBeUndefined();
      expect(parsed.channels.telegram.botToken).toBe("token");

      // skills.allowUnverified should be deleted
      expect(parsed.skills.allowUnverified).toBeUndefined();
      expect(parsed.skills.allowBundled).toEqual(["github"]);
    });

    it("should return requiresRestart: true on success", async () => {
      const target = new GceTarget(baseConfig);

      const { SecretManagerServiceClient } = jest.requireMock("@google-cloud/secret-manager");
      const { InstancesClient } = jest.requireMock("@google-cloud/compute");

      const secretClient = SecretManagerServiceClient.mock.results.at(-1)?.value;
      const instancesClient = InstancesClient.mock.results.at(-1)?.value;

      // Mock secret manager
      secretClient.getSecret.mockResolvedValue([{}]);
      secretClient.addSecretVersion.mockResolvedValue([{}]);

      // Mock VM metadata update
      instancesClient.get.mockResolvedValue([
        { metadata: { items: [], fingerprint: "abc" } },
      ]);
      instancesClient.setMetadata.mockResolvedValue([{ name: "op-1" }]);

      const result = await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {},
      });

      expect(result.success).toBe(true);
      expect(result.requiresRestart).toBe(true);
    });
  });

  describe("getStatus", () => {
    it("should return running when VM is running", async () => {
      const target = new GceTarget(baseConfig);

      const { InstancesClient } = jest.requireMock("@google-cloud/compute");
      const mockClient = InstancesClient.mock.results[0]?.value;
      if (mockClient) {
        mockClient.get.mockResolvedValue([
          {
            status: "RUNNING",
          },
        ]);
      }

      const status = await target.getStatus();

      expect(status.state).toBe("running");
    });

    it("should return stopped when VM is stopped", async () => {
      const target = new GceTarget(baseConfig);

      const { InstancesClient } = jest.requireMock("@google-cloud/compute");
      const mockClient = InstancesClient.mock.results[0]?.value;
      if (mockClient) {
        mockClient.get.mockResolvedValue([
          {
            status: "STOPPED",
          },
        ]);
      }

      const status = await target.getStatus();

      expect(status.state).toBe("stopped");
    });

    it("should return stopped when VM is terminated", async () => {
      const target = new GceTarget(baseConfig);

      const { InstancesClient } = jest.requireMock("@google-cloud/compute");
      const mockClient = InstancesClient.mock.results[0]?.value;
      if (mockClient) {
        mockClient.get.mockResolvedValue([
          {
            status: "TERMINATED",
          },
        ]);
      }

      const status = await target.getStatus();

      expect(status.state).toBe("stopped");
    });

    it("should return not-installed when VM not found", async () => {
      const target = new GceTarget(baseConfig);

      const { InstancesClient } = jest.requireMock("@google-cloud/compute");
      const mockClient = InstancesClient.mock.results[0]?.value;
      if (mockClient) {
        mockClient.get.mockRejectedValue(new Error("NOT_FOUND"));
      }

      const status = await target.getStatus();

      expect(status.state).toBe("not-installed");
    });
  });

  describe("getEndpoint", () => {
    it("should return external LB IP with HTTP when no SSL certificate", async () => {
      const target = new GceTarget(baseConfig);

      const { GlobalAddressesClient } = jest.requireMock("@google-cloud/compute");
      const mockClient = GlobalAddressesClient.mock.results[0]?.value;
      if (mockClient) {
        mockClient.get.mockResolvedValue([{ address: "34.120.1.1" }]);
      }

      const endpoint = await target.getEndpoint();

      expect(endpoint.host).toBe("34.120.1.1");
      expect(endpoint.port).toBe(80);
      expect(endpoint.protocol).toBe("ws");
    });

    it("should return HTTPS endpoint when SSL certificate is configured", async () => {
      const configWithSsl: GceConfig = {
        ...baseConfig,
        sslCertificateId: "projects/test/global/sslCertificates/my-cert",
        customDomain: "bot.example.com",
      };
      const target = new GceTarget(configWithSsl);

      const { GlobalAddressesClient } = jest.requireMock("@google-cloud/compute");
      const mockClient = GlobalAddressesClient.mock.results[0]?.value;
      if (mockClient) {
        mockClient.get.mockResolvedValue([{ address: "34.120.1.1" }]);
      }

      const endpoint = await target.getEndpoint();

      expect(endpoint.host).toBe("bot.example.com");
      expect(endpoint.port).toBe(443);
      expect(endpoint.protocol).toBe("wss");
    });

    it("should throw error when external IP not found", async () => {
      const target = new GceTarget(baseConfig);

      const { GlobalAddressesClient } = jest.requireMock("@google-cloud/compute");
      const mockClient = GlobalAddressesClient.mock.results[0]?.value;
      if (mockClient) {
        mockClient.get.mockResolvedValue([{ address: "" }]);
      }

      await expect(target.getEndpoint()).rejects.toThrow("External IP address not found");
    });
  });

  describe("start", () => {
    it("should call instancesClient.start", async () => {
      const target = new GceTarget(baseConfig);

      const { InstancesClient } = jest.requireMock("@google-cloud/compute");
      const mockClient = InstancesClient.mock.results[0]?.value;
      if (mockClient) {
        mockClient.start.mockResolvedValue([{ name: "op-1" }]);
      }

      await target.start();

      expect(mockClient.start).toHaveBeenCalledWith({
        project: "test-project",
        zone: "us-central1-a",
        instance: "clawster-test-bot",
      });
    });
  });

  describe("stop", () => {
    it("should call instancesClient.stop", async () => {
      const target = new GceTarget(baseConfig);

      const { InstancesClient } = jest.requireMock("@google-cloud/compute");
      const mockClient = InstancesClient.mock.results[0]?.value;
      if (mockClient) {
        mockClient.stop.mockResolvedValue([{ name: "op-1" }]);
      }

      await target.stop();

      expect(mockClient.stop).toHaveBeenCalledWith({
        project: "test-project",
        zone: "us-central1-a",
        instance: "clawster-test-bot",
      });
    });
  });

  describe("restart", () => {
    it("should call instancesClient.reset", async () => {
      const target = new GceTarget(baseConfig);

      const { InstancesClient } = jest.requireMock("@google-cloud/compute");
      const mockClient = InstancesClient.mock.results[0]?.value;
      if (mockClient) {
        mockClient.reset.mockResolvedValue([{ name: "op-1" }]);
      }

      await target.restart();

      expect(mockClient.reset).toHaveBeenCalledWith({
        project: "test-project",
        zone: "us-central1-a",
        instance: "clawster-test-bot",
      });
    });
  });

  describe("getLogs", () => {
    it("should return logs from Cloud Logging", async () => {
      const target = new GceTarget(baseConfig);

      const { Logging } = jest.requireMock("@google-cloud/logging");
      const mockLogging = Logging.mock.results[0]?.value;
      if (mockLogging) {
        mockLogging.log.mockReturnValue({
          getEntries: jest.fn().mockResolvedValue([
            [
              { data: { message: "Log line 1" } },
              { data: { message: "Log line 2" } },
            ],
          ]),
        });
      }

      const logs = await target.getLogs({ lines: 10 });

      // Logs are reversed to chronological order
      expect(logs).toEqual(["Log line 2", "Log line 1"]);
    });

    it("should filter logs when filter option is provided", async () => {
      const target = new GceTarget(baseConfig);

      const { Logging } = jest.requireMock("@google-cloud/logging");
      const mockLogging = Logging.mock.results[0]?.value;
      if (mockLogging) {
        mockLogging.log.mockReturnValue({
          getEntries: jest.fn().mockResolvedValue([
            [
              { data: { message: "Error: something failed" } },
              { data: { message: "Info: all good" } },
              { data: { message: "Error: another failure" } },
            ],
          ]),
        });
      }

      const logs = await target.getLogs({ filter: "Error" });

      expect(logs).toHaveLength(2);
      expect(logs.every((log) => log.includes("Error"))).toBe(true);
    });

    it("should return empty array on error", async () => {
      const target = new GceTarget(baseConfig);

      const { Logging } = jest.requireMock("@google-cloud/logging");
      const mockLogging = Logging.mock.results[0]?.value;
      if (mockLogging) {
        mockLogging.log.mockReturnValue({
          getEntries: jest.fn().mockRejectedValue(new Error("Logging error")),
        });
      }

      const logs = await target.getLogs();

      expect(logs).toEqual([]);
    });
  });

  describe("destroy", () => {
    it("should delete resources in reverse order", async () => {
      const target = new GceTarget(baseConfig);

      const deleteOrder: string[] = [];

      // Mock all delete operations
      const {
        GlobalForwardingRulesClient,
        TargetHttpProxiesClient,
        UrlMapsClient,
        BackendServicesClient,
        SecurityPoliciesClient,
        InstanceGroupsClient,
        InstancesClient,
        DisksClient,
        GlobalAddressesClient,
        FirewallsClient,
      } = jest.requireMock("@google-cloud/compute");
      const { SecretManagerServiceClient } = jest.requireMock("@google-cloud/secret-manager");

      GlobalForwardingRulesClient.mock.results.at(-1)?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("forwarding-rule");
        return [{ name: "op-1" }];
      });

      TargetHttpProxiesClient.mock.results.at(-1)?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("http-proxy");
        return [{ name: "op-1" }];
      });

      UrlMapsClient.mock.results.at(-1)?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("url-map");
        return [{ name: "op-1" }];
      });

      BackendServicesClient.mock.results.at(-1)?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("backend-service");
        return [{ name: "op-1" }];
      });

      SecurityPoliciesClient.mock.results.at(-1)?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("security-policy");
        return [{ name: "op-1" }];
      });

      InstanceGroupsClient.mock.results.at(-1)?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("instance-group");
        return [{ name: "op-1" }];
      });

      InstancesClient.mock.results.at(-1)?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("vm-instance");
        return [{ name: "op-1" }];
      });

      DisksClient.mock.results.at(-1)?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("data-disk");
        return [{ name: "op-1" }];
      });

      GlobalAddressesClient.mock.results.at(-1)?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("external-ip");
        return [{ name: "op-1" }];
      });

      FirewallsClient.mock.results.at(-1)?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("firewall");
        return [{ name: "op-1" }];
      });

      SecretManagerServiceClient.mock.results.at(-1)?.value?.deleteSecret?.mockImplementation(() => {
        deleteOrder.push("secret");
        return Promise.resolve();
      });

      await target.destroy();

      // Verify deletion order (reverse of creation)
      expect(deleteOrder.indexOf("forwarding-rule")).toBeLessThan(deleteOrder.indexOf("http-proxy"));
      expect(deleteOrder.indexOf("http-proxy")).toBeLessThan(deleteOrder.indexOf("url-map"));
      expect(deleteOrder.indexOf("url-map")).toBeLessThan(deleteOrder.indexOf("backend-service"));
      expect(deleteOrder.indexOf("instance-group")).toBeLessThan(deleteOrder.indexOf("vm-instance"));
      expect(deleteOrder.indexOf("vm-instance")).toBeLessThan(deleteOrder.indexOf("data-disk"));
      expect(deleteOrder.indexOf("data-disk")).toBeLessThan(deleteOrder.indexOf("secret"));
    });

    it("should continue deletion even if some resources are not found", async () => {
      const target = new GceTarget(baseConfig);

      const {
        GlobalForwardingRulesClient,
        TargetHttpProxiesClient,
        UrlMapsClient,
        BackendServicesClient,
        SecurityPoliciesClient,
        InstanceGroupsClient,
        InstancesClient,
        DisksClient,
        GlobalAddressesClient,
        FirewallsClient,
      } = jest.requireMock("@google-cloud/compute");
      const { SecretManagerServiceClient } = jest.requireMock("@google-cloud/secret-manager");

      // First delete fails with NOT_FOUND (already deleted - should be ignored)
      GlobalForwardingRulesClient.mock.results.at(-1)?.value?.delete?.mockRejectedValue(
        new Error("NOT_FOUND: Resource was not found")
      );

      // All other deletes succeed
      TargetHttpProxiesClient.mock.results.at(-1)?.value?.delete?.mockResolvedValue([{ name: "op-1" }]);
      UrlMapsClient.mock.results.at(-1)?.value?.delete?.mockResolvedValue([{ name: "op-1" }]);
      BackendServicesClient.mock.results.at(-1)?.value?.delete?.mockResolvedValue([{ name: "op-1" }]);
      SecurityPoliciesClient.mock.results.at(-1)?.value?.delete?.mockResolvedValue([{ name: "op-1" }]);
      InstanceGroupsClient.mock.results.at(-1)?.value?.delete?.mockResolvedValue([{ name: "op-1" }]);
      InstancesClient.mock.results.at(-1)?.value?.delete?.mockResolvedValue([{ name: "op-1" }]);
      DisksClient.mock.results.at(-1)?.value?.delete?.mockResolvedValue([{ name: "op-1" }]);
      GlobalAddressesClient.mock.results.at(-1)?.value?.delete?.mockResolvedValue([{ name: "op-1" }]);
      FirewallsClient.mock.results.at(-1)?.value?.delete?.mockResolvedValue([{ name: "op-1" }]);
      SecretManagerServiceClient.mock.results.at(-1)?.value?.deleteSecret?.mockResolvedValue(undefined);

      // Should not throw when resources are NOT_FOUND
      await expect(target.destroy()).resolves.not.toThrow();
    });
  });
});
