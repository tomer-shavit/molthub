import { AzureVmTarget } from "./azure-vm-target";
import { DeploymentTargetType } from "../../interface/deployment-target";

// Track mock call counts
let vnetGetCalls = 0;
let nsgGetCalls = 0;
let vmSubnetGetCalls = 0;
let appGwSubnetGetCalls = 0;
let nicGetCalls = 0;
let diskGetCalls = 0;
let appGwGetCalls = 0;
let pipGetCalls = 0;

// Reset counters before each test
beforeEach(() => {
  vnetGetCalls = 0;
  nsgGetCalls = 0;
  vmSubnetGetCalls = 0;
  appGwSubnetGetCalls = 0;
  nicGetCalls = 0;
  diskGetCalls = 0;
  appGwGetCalls = 0;
  pipGetCalls = 0;
});

// Mock Azure SDK clients
jest.mock("@azure/arm-compute", () => ({
  ComputeManagementClient: jest.fn().mockImplementation(() => ({
    virtualMachines: {
      beginCreateOrUpdateAndWait: jest.fn().mockResolvedValue({}),
      beginStartAndWait: jest.fn().mockResolvedValue({}),
      beginDeallocateAndWait: jest.fn().mockResolvedValue({}),
      beginRestartAndWait: jest.fn().mockResolvedValue({}),
      beginDeleteAndWait: jest.fn().mockResolvedValue({}),
      instanceView: jest.fn().mockResolvedValue({
        statuses: [{ code: "PowerState/running" }],
      }),
      beginRunCommandAndWait: jest.fn().mockResolvedValue({
        value: [{ message: "Success" }],
      }),
    },
    disks: {
      get: jest.fn().mockImplementation(() => {
        diskGetCalls++;
        if (diskGetCalls === 1) {
          return Promise.reject({ statusCode: 404 });
        }
        return Promise.resolve({ id: "/subscriptions/xxx/disks/disk1" });
      }),
      beginCreateOrUpdateAndWait: jest.fn().mockResolvedValue({ id: "/subscriptions/xxx/disks/disk1" }),
      beginDeleteAndWait: jest.fn().mockResolvedValue({}),
    },
  })),
}));

jest.mock("@azure/arm-network", () => ({
  NetworkManagementClient: jest.fn().mockImplementation(() => ({
    virtualNetworks: {
      get: jest.fn().mockImplementation(() => {
        vnetGetCalls++;
        if (vnetGetCalls === 1) {
          return Promise.reject({ statusCode: 404 });
        }
        return Promise.resolve({ id: "/subscriptions/xxx/vnets/vnet1" });
      }),
      beginCreateOrUpdateAndWait: jest.fn().mockResolvedValue({ id: "/subscriptions/xxx/vnets/vnet1" }),
    },
    networkSecurityGroups: {
      get: jest.fn().mockImplementation(() => {
        nsgGetCalls++;
        if (nsgGetCalls === 1) {
          return Promise.reject({ statusCode: 404 });
        }
        return Promise.resolve({ id: "/subscriptions/xxx/nsg/nsg1" });
      }),
      beginCreateOrUpdateAndWait: jest.fn().mockResolvedValue({ id: "/subscriptions/xxx/nsg/nsg1" }),
    },
    subnets: {
      get: jest.fn().mockImplementation((_rg: string, _vnet: string, name: string) => {
        if (name.includes("appgw")) {
          appGwSubnetGetCalls++;
          if (appGwSubnetGetCalls === 1) {
            return Promise.reject({ statusCode: 404 });
          }
          return Promise.resolve({ id: "/subscriptions/xxx/subnets/appgw-subnet" });
        }
        vmSubnetGetCalls++;
        if (vmSubnetGetCalls === 1) {
          return Promise.reject({ statusCode: 404 });
        }
        return Promise.resolve({ id: "/subscriptions/xxx/subnets/vm-subnet" });
      }),
      beginCreateOrUpdateAndWait: jest.fn().mockResolvedValue({ id: "/subscriptions/xxx/subnets/subnet1" }),
      beginDeleteAndWait: jest.fn().mockResolvedValue({}),
    },
    networkInterfaces: {
      get: jest.fn().mockImplementation(() => {
        nicGetCalls++;
        if (nicGetCalls === 1) {
          return Promise.reject({ statusCode: 404 });
        }
        return Promise.resolve({
          id: "/subscriptions/xxx/nic/nic1",
          ipConfigurations: [{ privateIPAddress: "10.0.1.5" }],
        });
      }),
      beginCreateOrUpdateAndWait: jest.fn().mockResolvedValue({ id: "/subscriptions/xxx/nic/nic1" }),
      beginDeleteAndWait: jest.fn().mockResolvedValue({}),
    },
    publicIPAddresses: {
      get: jest.fn().mockImplementation(() => {
        pipGetCalls++;
        if (pipGetCalls === 1) {
          return Promise.reject({ statusCode: 404 });
        }
        return Promise.resolve({
          ipAddress: "20.30.40.50",
          dnsSettings: { fqdn: "test-app.eastus.cloudapp.azure.com" },
        });
      }),
      beginCreateOrUpdateAndWait: jest.fn().mockResolvedValue({
        ipAddress: "20.30.40.50",
        dnsSettings: { fqdn: "test-app.eastus.cloudapp.azure.com" },
      }),
      beginDeleteAndWait: jest.fn().mockResolvedValue({}),
    },
    applicationGateways: {
      get: jest.fn().mockImplementation(() => {
        appGwGetCalls++;
        if (appGwGetCalls === 1) {
          return Promise.reject({ statusCode: 404 });
        }
        return Promise.resolve({
          frontendIPConfigurations: [{ publicIPAddress: { id: "/subscriptions/xxx/pip/pip1" } }],
        });
      }),
      beginCreateOrUpdateAndWait: jest.fn().mockResolvedValue({}),
      beginDeleteAndWait: jest.fn().mockResolvedValue({}),
    },
  })),
}));

jest.mock("@azure/identity", () => ({
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({})),
  ClientSecretCredential: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@azure/keyvault-secrets", () => ({
  SecretClient: jest.fn().mockImplementation(() => ({
    setSecret: jest.fn().mockResolvedValue({}),
    beginDeleteSecret: jest.fn().mockResolvedValue({}),
  })),
}));

jest.mock("@azure/monitor-query", () => ({
  LogsQueryClient: jest.fn().mockImplementation(() => ({
    queryWorkspace: jest.fn().mockResolvedValue({ tables: [] }),
  })),
}));

describe("AzureVmTarget", () => {
  const baseConfig = {
    subscriptionId: "sub-123",
    resourceGroup: "test-rg",
    region: "eastus",
    profileName: "test-bot",
    keyVaultName: "test-vault",
  };

  describe("constructor", () => {
    it("should create instance with default credentials", () => {
      const target = new AzureVmTarget(baseConfig);
      expect(target.type).toBe(DeploymentTargetType.AZURE_VM);
    });

    it("should create instance with service principal credentials", () => {
      const target = new AzureVmTarget({
        ...baseConfig,
        clientId: "client-123",
        clientSecret: "secret-123",
        tenantId: "tenant-123",
      });
      expect(target.type).toBe(DeploymentTargetType.AZURE_VM);
    });
  });

  describe("install", () => {
    it("should install VM successfully", async () => {
      const target = new AzureVmTarget(baseConfig);

      const result = await target.install({
        profileName: "test-bot",
        port: 18789,
        gatewayAuthToken: "test-token",
      });

      expect(result.success).toBe(true);
      expect(result.instanceId).toBe("clawster-test-bot");
      expect(result.message).toContain("Azure VM");
    });
  });

  describe("configure", () => {
    it("should configure the VM with config", async () => {
      const target = new AzureVmTarget(baseConfig);

      // Install first
      await target.install({
        profileName: "test-bot",
        port: 18789,
      });

      const result = await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {
          llm: { provider: "openai", model: "gpt-4" },
          gateway: { bind: "lan" },
        },
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Configuration applied");
    });
  });

  describe("getStatus", () => {
    it("should return running status when VM is running", async () => {
      const target = new AzureVmTarget(baseConfig);
      await target.install({ profileName: "test-bot", port: 18789 });

      const status = await target.getStatus();
      expect(status.state).toBe("running");
    });
  });

  describe("getEndpoint", () => {
    it("should return Application Gateway endpoint", async () => {
      const target = new AzureVmTarget(baseConfig);
      await target.install({ profileName: "test-bot", port: 18789 });

      const endpoint = await target.getEndpoint();
      expect(endpoint.host).toBe("test-app.eastus.cloudapp.azure.com");
      expect(endpoint.port).toBe(80);
      expect(endpoint.protocol).toBe("ws");
    });
  });

  describe("start", () => {
    it("should start the VM", async () => {
      const target = new AzureVmTarget(baseConfig);
      await target.install({ profileName: "test-bot", port: 18789 });

      await expect(target.start()).resolves.not.toThrow();
    });
  });

  describe("stop", () => {
    it("should stop (deallocate) the VM", async () => {
      const target = new AzureVmTarget(baseConfig);
      await target.install({ profileName: "test-bot", port: 18789 });

      await expect(target.stop()).resolves.not.toThrow();
    });
  });

  describe("restart", () => {
    it("should restart the VM", async () => {
      const target = new AzureVmTarget(baseConfig);
      await target.install({ profileName: "test-bot", port: 18789 });

      await expect(target.restart()).resolves.not.toThrow();
    });
  });

  describe("getLogs", () => {
    it("should return logs via Run Command", async () => {
      const target = new AzureVmTarget(baseConfig);
      await target.install({ profileName: "test-bot", port: 18789 });

      const logs = await target.getLogs({ lines: 50 });
      expect(Array.isArray(logs)).toBe(true);
    });
  });

  describe("destroy", () => {
    it("should destroy all resources", async () => {
      const target = new AzureVmTarget(baseConfig);
      await target.install({ profileName: "test-bot", port: 18789 });

      await expect(target.destroy()).resolves.not.toThrow();
    });
  });
});
