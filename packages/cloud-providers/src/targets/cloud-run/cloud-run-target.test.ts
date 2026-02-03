import { CloudRunTarget } from "./cloud-run-target";
import type { CloudRunConfig } from "./cloud-run-config";
import { DeploymentTargetType } from "../../interface/deployment-target";

// Mock all GCP SDK clients
jest.mock("@google-cloud/run", () => ({
  ServicesClient: jest.fn().mockImplementation(() => ({
    servicePath: jest.fn((project, region, service) =>
      `projects/${project}/locations/${region}/services/${service}`
    ),
    getService: jest.fn(),
    createService: jest.fn(),
    updateService: jest.fn(),
    deleteService: jest.fn(),
  })),
  RevisionsClient: jest.fn().mockImplementation(() => ({})),
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

jest.mock("@google-cloud/compute", () => ({
  NetworksClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
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
  RegionNetworkEndpointGroupsClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  })),
  SecurityPoliciesClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  })),
}));

describe("CloudRunTarget", () => {
  const baseConfig: CloudRunConfig = {
    projectId: "test-project",
    region: "us-central1",
    profileName: "test-bot",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create a CloudRunTarget with default values", () => {
      const target = new CloudRunTarget(baseConfig);

      expect(target.type).toBe(DeploymentTargetType.CLOUD_RUN);
    });

    it("should derive resource names from profileName", () => {
      const target = new CloudRunTarget(baseConfig);

      // Access private properties via type assertion for testing
      const targetAny = target as unknown as {
        serviceName: string;
        secretName: string;
        vpcNetworkName: string;
      };

      expect(targetAny.serviceName).toBe("clawster-test-bot");
      expect(targetAny.secretName).toBe("clawster-test-bot-config");
      expect(targetAny.vpcNetworkName).toBe("clawster-vpc-test-bot");
    });

    it("should use custom values from config when provided", () => {
      const customConfig: CloudRunConfig = {
        ...baseConfig,
        cpu: "2",
        memory: "4Gi",
        maxInstances: 5,
        vpcNetworkName: "custom-vpc",
      };

      const target = new CloudRunTarget(customConfig);
      const targetAny = target as unknown as {
        cpu: string;
        memory: string;
        maxInstances: number;
        vpcNetworkName: string;
      };

      expect(targetAny.cpu).toBe("2");
      expect(targetAny.memory).toBe("4Gi");
      expect(targetAny.maxInstances).toBe(5);
      expect(targetAny.vpcNetworkName).toBe("custom-vpc");
    });
  });

  describe("sanitizeName", () => {
    it("should sanitize names for GCP resources", () => {
      const target = new CloudRunTarget(baseConfig);
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
      const target = new CloudRunTarget(baseConfig);
      const targetAny = target as unknown as {
        sanitizeName: (name: string) => string;
      };

      const longName = "a".repeat(100);
      expect(targetAny.sanitizeName(longName).length).toBeLessThanOrEqual(63);
    });
  });

  describe("install", () => {
    it("should return success result on successful install", async () => {
      const target = new CloudRunTarget(baseConfig);

      // Mock all the necessary methods
      const targetAny = target as unknown as {
        ensureSecret: jest.Mock;
        ensureVpcNetwork: jest.Mock;
        ensureVpcConnector: jest.Mock;
        ensureExternalIp: jest.Mock;
        createCloudRunService: jest.Mock;
        ensureServerlessNeg: jest.Mock;
        ensureBackendService: jest.Mock;
        ensureUrlMap: jest.Mock;
        ensureHttpProxy: jest.Mock;
        ensureForwardingRule: jest.Mock;
      };

      targetAny.ensureSecret = jest.fn().mockResolvedValue(undefined);
      targetAny.ensureVpcNetwork = jest.fn().mockResolvedValue(undefined);
      targetAny.ensureVpcConnector = jest.fn().mockResolvedValue(undefined);
      targetAny.ensureExternalIp = jest.fn().mockResolvedValue(undefined);
      targetAny.createCloudRunService = jest.fn().mockResolvedValue(undefined);
      targetAny.ensureServerlessNeg = jest.fn().mockResolvedValue(undefined);
      targetAny.ensureBackendService = jest.fn().mockResolvedValue(undefined);
      targetAny.ensureUrlMap = jest.fn().mockResolvedValue(undefined);
      targetAny.ensureHttpProxy = jest.fn().mockResolvedValue(undefined);
      targetAny.ensureForwardingRule = jest.fn().mockResolvedValue(undefined);

      const result = await target.install({
        profileName: "test-bot",
        port: 18789,
      });

      expect(result.success).toBe(true);
      expect(result.instanceId).toBe("clawster-test-bot");
      expect(result.message).toContain("Cloud Run service");
      expect(result.message).toContain("secure");
    });

    it("should return failure result on error", async () => {
      const target = new CloudRunTarget(baseConfig);

      const targetAny = target as unknown as {
        ensureSecret: jest.Mock;
      };

      targetAny.ensureSecret = jest.fn().mockRejectedValue(new Error("Secret creation failed"));

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
      const target = new CloudRunTarget(baseConfig);

      const targetAny = target as unknown as {
        ensureSecret: jest.Mock;
        updateCloudRunServiceEnv: jest.Mock;
      };

      let capturedConfig: string | undefined;
      targetAny.ensureSecret = jest.fn().mockImplementation((_name, config) => {
        capturedConfig = config;
        return Promise.resolve();
      });
      targetAny.updateCloudRunServiceEnv = jest.fn().mockResolvedValue(undefined);

      await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {
          gateway: {
            port: 12345, // Should be deleted
            host: "localhost", // Should be deleted
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

      expect(targetAny.ensureSecret).toHaveBeenCalled();
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
      const target = new CloudRunTarget(baseConfig);

      const targetAny = target as unknown as {
        ensureSecret: jest.Mock;
        updateCloudRunServiceEnv: jest.Mock;
      };

      targetAny.ensureSecret = jest.fn().mockResolvedValue(undefined);
      targetAny.updateCloudRunServiceEnv = jest.fn().mockResolvedValue(undefined);

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
    it("should return running when service is ready", async () => {
      const target = new CloudRunTarget(baseConfig);

      const { ServicesClient } = jest.requireMock("@google-cloud/run");
      const mockClient = ServicesClient.mock.results[0]?.value;
      if (mockClient) {
        mockClient.getService.mockResolvedValue([
          {
            conditions: [{ type: "Ready", state: "CONDITION_SUCCEEDED" }],
            template: { scaling: { minInstanceCount: 1, maxInstanceCount: 1 } },
          },
        ]);
      }

      const status = await target.getStatus();

      expect(status.state).toBe("running");
    });

    it("should return stopped when maxInstances is 0", async () => {
      const target = new CloudRunTarget(baseConfig);

      const { ServicesClient } = jest.requireMock("@google-cloud/run");
      const mockClient = ServicesClient.mock.results[0]?.value;
      if (mockClient) {
        mockClient.getService.mockResolvedValue([
          {
            conditions: [{ type: "Ready", state: "CONDITION_SUCCEEDED" }],
            template: { scaling: { minInstanceCount: 0, maxInstanceCount: 0 } },
          },
        ]);
      }

      const status = await target.getStatus();

      expect(status.state).toBe("stopped");
    });

    it("should return error when service is not ready", async () => {
      const target = new CloudRunTarget(baseConfig);

      const { ServicesClient } = jest.requireMock("@google-cloud/run");
      const mockClient = ServicesClient.mock.results[0]?.value;
      if (mockClient) {
        mockClient.getService.mockResolvedValue([
          {
            conditions: [
              {
                type: "Ready",
                state: "CONDITION_FAILED",
                message: "Container failed to start",
              },
            ],
          },
        ]);
      }

      const status = await target.getStatus();

      expect(status.state).toBe("error");
      expect(status.error).toContain("Container failed to start");
    });

    it("should return not-installed when service not found", async () => {
      const target = new CloudRunTarget(baseConfig);

      const { ServicesClient } = jest.requireMock("@google-cloud/run");
      const mockClient = ServicesClient.mock.results[0]?.value;
      if (mockClient) {
        mockClient.getService.mockRejectedValue(new Error("NOT_FOUND"));
      }

      const status = await target.getStatus();

      expect(status.state).toBe("not-installed");
    });
  });

  describe("getEndpoint", () => {
    it("should return external LB IP with HTTP when no SSL certificate", async () => {
      const target = new CloudRunTarget(baseConfig);

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
      const configWithSsl: CloudRunConfig = {
        ...baseConfig,
        sslCertificateId: "projects/test/global/sslCertificates/my-cert",
        customDomain: "bot.example.com",
      };
      const target = new CloudRunTarget(configWithSsl);

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
      const target = new CloudRunTarget(baseConfig);

      const { GlobalAddressesClient } = jest.requireMock("@google-cloud/compute");
      const mockClient = GlobalAddressesClient.mock.results[0]?.value;
      if (mockClient) {
        mockClient.get.mockResolvedValue([{ address: "" }]);
      }

      await expect(target.getEndpoint()).rejects.toThrow("External IP address not found");
    });
  });

  describe("start", () => {
    it("should set minInstanceCount to 1", async () => {
      const target = new CloudRunTarget(baseConfig);

      const { ServicesClient } = jest.requireMock("@google-cloud/run");
      const mockClient = ServicesClient.mock.results[0]?.value;
      let capturedService: unknown;
      if (mockClient) {
        mockClient.getService.mockResolvedValue([
          {
            template: { scaling: { minInstanceCount: 0, maxInstanceCount: 1 } },
          },
        ]);
        mockClient.updateService.mockImplementation((args: { service: unknown }) => {
          capturedService = args.service;
          return [{ promise: () => Promise.resolve() }];
        });
      }

      await target.start();

      expect(capturedService).toBeDefined();
      const service = capturedService as { template: { scaling: { minInstanceCount: number } } };
      expect(service.template.scaling.minInstanceCount).toBe(1);
    });
  });

  describe("stop", () => {
    it("should set minInstanceCount and maxInstanceCount to 0", async () => {
      const target = new CloudRunTarget(baseConfig);

      const { ServicesClient } = jest.requireMock("@google-cloud/run");
      const mockClient = ServicesClient.mock.results[0]?.value;
      let capturedService: unknown;
      if (mockClient) {
        mockClient.getService.mockResolvedValue([
          {
            template: { scaling: { minInstanceCount: 1, maxInstanceCount: 1 } },
          },
        ]);
        mockClient.updateService.mockImplementation((args: { service: unknown }) => {
          capturedService = args.service;
          return [{ promise: () => Promise.resolve() }];
        });
      }

      await target.stop();

      expect(capturedService).toBeDefined();
      const service = capturedService as { template: { scaling: { minInstanceCount: number; maxInstanceCount: number } } };
      expect(service.template.scaling.minInstanceCount).toBe(0);
      expect(service.template.scaling.maxInstanceCount).toBe(0);
    });
  });

  describe("restart", () => {
    it("should add restart timestamp annotation", async () => {
      const target = new CloudRunTarget(baseConfig);

      const { ServicesClient } = jest.requireMock("@google-cloud/run");
      const mockClient = ServicesClient.mock.results[0]?.value;
      let capturedService: unknown;
      if (mockClient) {
        mockClient.getService.mockResolvedValue([
          {
            template: {
              scaling: { minInstanceCount: 0, maxInstanceCount: 1 },
              annotations: {},
            },
          },
        ]);
        mockClient.updateService.mockImplementation((args: { service: unknown }) => {
          capturedService = args.service;
          return [{ promise: () => Promise.resolve() }];
        });
      }

      await target.restart();

      expect(capturedService).toBeDefined();
      const service = capturedService as { template: { annotations: Record<string, string> } };
      expect(service.template.annotations["clawster/restart-timestamp"]).toBeDefined();
    });
  });

  describe("getLogs", () => {
    it("should return logs from Cloud Logging", async () => {
      const target = new CloudRunTarget(baseConfig);

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
      const target = new CloudRunTarget(baseConfig);

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
      const target = new CloudRunTarget(baseConfig);

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
      const target = new CloudRunTarget(baseConfig);

      const deleteOrder: string[] = [];

      // Mock all delete operations
      const { GlobalForwardingRulesClient, TargetHttpProxiesClient, UrlMapsClient, BackendServicesClient, SecurityPoliciesClient, RegionNetworkEndpointGroupsClient, GlobalAddressesClient } = jest.requireMock("@google-cloud/compute");
      const { ServicesClient } = jest.requireMock("@google-cloud/run");
      const { SecretManagerServiceClient } = jest.requireMock("@google-cloud/secret-manager");

      const mockOperation = { name: "op-1", latestResponse: { status: "DONE" } };

      GlobalForwardingRulesClient.mock.results[0]?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("forwarding-rule");
        return [mockOperation];
      });

      TargetHttpProxiesClient.mock.results[0]?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("http-proxy");
        return [mockOperation];
      });

      UrlMapsClient.mock.results[0]?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("url-map");
        return [mockOperation];
      });

      BackendServicesClient.mock.results[0]?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("backend-service");
        return [mockOperation];
      });

      SecurityPoliciesClient.mock.results[0]?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("security-policy");
        return [mockOperation];
      });

      RegionNetworkEndpointGroupsClient.mock.results[0]?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("neg");
        return [mockOperation];
      });

      ServicesClient.mock.results[0]?.value?.deleteService?.mockImplementation(() => {
        deleteOrder.push("cloud-run-service");
        return [{ promise: () => Promise.resolve() }];
      });

      GlobalAddressesClient.mock.results[0]?.value?.delete?.mockImplementation(() => {
        deleteOrder.push("external-ip");
        return [mockOperation];
      });

      SecretManagerServiceClient.mock.results[0]?.value?.deleteSecret?.mockImplementation(() => {
        deleteOrder.push("secret");
        return Promise.resolve();
      });

      await target.destroy();

      // Verify deletion order (reverse of creation)
      expect(deleteOrder.indexOf("forwarding-rule")).toBeLessThan(deleteOrder.indexOf("http-proxy"));
      expect(deleteOrder.indexOf("http-proxy")).toBeLessThan(deleteOrder.indexOf("url-map"));
      expect(deleteOrder.indexOf("url-map")).toBeLessThan(deleteOrder.indexOf("backend-service"));
      expect(deleteOrder.indexOf("backend-service")).toBeLessThan(deleteOrder.indexOf("neg"));
      expect(deleteOrder.indexOf("neg")).toBeLessThan(deleteOrder.indexOf("cloud-run-service"));
      expect(deleteOrder.indexOf("cloud-run-service")).toBeLessThan(deleteOrder.indexOf("secret"));
    });

    it("should continue deletion even if some resources fail", async () => {
      const target = new CloudRunTarget(baseConfig);

      const { GlobalForwardingRulesClient, TargetHttpProxiesClient } = jest.requireMock("@google-cloud/compute");
      const { SecretManagerServiceClient } = jest.requireMock("@google-cloud/secret-manager");

      // First delete fails
      GlobalForwardingRulesClient.mock.results[0]?.value?.delete?.mockRejectedValue(
        new Error("Resource not found")
      );

      // Second delete works
      const mockOperation = { name: "op-1", latestResponse: { status: "DONE" } };
      TargetHttpProxiesClient.mock.results[0]?.value?.delete?.mockResolvedValue([mockOperation]);

      // Secret delete also works
      SecretManagerServiceClient.mock.results[0]?.value?.deleteSecret?.mockResolvedValue(undefined);

      // Should not throw
      await expect(target.destroy()).resolves.not.toThrow();
    });
  });
});
