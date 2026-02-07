import { AzureVmTarget } from "./azure-vm-target";
import { DeploymentTargetType } from "../../interface/deployment-target";
import type { IAzureNetworkManager, IAzureComputeManager, IAzureSharedInfraManager } from "./managers";
import type { AzureVmConfig } from "./azure-vm-config";
import type { AzureManagers } from "./azure-manager-factory";

// Mock Azure SDK clients (needed for constructor — target creates them internally)
jest.mock("@azure/arm-compute", () => ({
  ComputeManagementClient: jest.fn().mockImplementation(() => ({
    virtualMachines: {
      beginCreateOrUpdateAndWait: jest.fn().mockResolvedValue({}),
      beginStartAndWait: jest.fn().mockResolvedValue({}),
      beginDeallocateAndWait: jest.fn().mockResolvedValue({}),
      beginRestartAndWait: jest.fn().mockResolvedValue({}),
      beginDeleteAndWait: jest.fn().mockResolvedValue({}),
      beginUpdateAndWait: jest.fn().mockResolvedValue({}),
      get: jest.fn().mockResolvedValue({ hardwareProfile: { vmSize: "Standard_B2s" } }),
      instanceView: jest.fn().mockResolvedValue({
        statuses: [{ code: "PowerState/running" }],
      }),
      beginRunCommandAndWait: jest.fn().mockResolvedValue({
        value: [{ message: "Success" }],
      }),
    },
    disks: {
      beginDeleteAndWait: jest.fn().mockResolvedValue({}),
    },
  })),
}));

jest.mock("@azure/arm-network", () => ({
  NetworkManagementClient: jest.fn().mockImplementation(() => ({
    subnets: {
      get: jest.fn().mockResolvedValue({ id: "/subscriptions/xxx/subnets/vm-subnet" }),
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

// ── Mock Manager Factories ──────────────────────────────────────────────

function createMockNetworkManager(): jest.Mocked<IAzureNetworkManager> {
  return {
    ensureVNet: jest.fn().mockResolvedValue({ id: "/subscriptions/xxx/vnets/clawster-vnet" }),
    ensureNSG: jest.fn().mockResolvedValue({ id: "/subscriptions/xxx/nsg/clawster-nsg" }),
    ensureVmSubnet: jest.fn().mockResolvedValue({ id: "/subscriptions/xxx/subnets/vm-subnet" }),
    ensurePublicIp: jest.fn().mockResolvedValue({
      id: "/subscriptions/xxx/pip/clawster-pip-test-bot",
      ipAddress: "20.30.40.50",
    }),
    getPublicIpAddress: jest.fn().mockResolvedValue("20.30.40.50"),
    deletePublicIp: jest.fn().mockResolvedValue(undefined),
    deleteVNet: jest.fn().mockResolvedValue(undefined),
    deleteNSG: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockComputeManager(): jest.Mocked<IAzureComputeManager> {
  return {
    createDataDisk: jest.fn().mockResolvedValue({ id: "/subscriptions/xxx/disks/disk1" }),
    createNic: jest.fn().mockResolvedValue({ id: "/subscriptions/xxx/nic/nic1" }),
    createVm: jest.fn().mockResolvedValue({}),
    startVm: jest.fn().mockResolvedValue(undefined),
    stopVm: jest.fn().mockResolvedValue(undefined),
    restartVm: jest.fn().mockResolvedValue(undefined),
    getVmStatus: jest.fn().mockResolvedValue("running"),
    resizeVm: jest.fn().mockResolvedValue(undefined),
    resizeDisk: jest.fn().mockResolvedValue(undefined),
    runCommand: jest.fn().mockResolvedValue("Success"),
    deleteVm: jest.fn().mockResolvedValue(undefined),
    deleteNic: jest.fn().mockResolvedValue(undefined),
    deleteDisk: jest.fn().mockResolvedValue(undefined),
    getVmPrivateIp: jest.fn().mockResolvedValue("10.0.1.5"),
  };
}

function createMockSharedInfraManager(): jest.Mocked<IAzureSharedInfraManager> {
  return {
    ensureStorageAccount: jest.fn().mockResolvedValue({
      id: "/subscriptions/xxx/storageAccounts/clawstersa",
      name: "clawstersa",
    }),
    ensureFileShare: jest.fn().mockResolvedValue(undefined),
    ensureManagedIdentity: jest.fn().mockResolvedValue({
      id: "/subscriptions/xxx/mi/clawster-mi",
      clientId: "mi-client-id",
      principalId: "mi-principal-id",
    }),
    ensureKeyVault: jest.fn().mockResolvedValue({
      id: "/subscriptions/xxx/vaults/test-vault",
      name: "test-vault",
      uri: "https://test-vault.vault.azure.net",
    }),
    assignRoles: jest.fn().mockResolvedValue(undefined),
  };
}

function createTarget(
  configOverrides: Partial<AzureVmConfig> = {},
  managerOverrides?: Partial<AzureManagers>
) {
  const networkManager = createMockNetworkManager();
  const computeManager = createMockComputeManager();
  const sharedInfraManager = createMockSharedInfraManager();

  const config: AzureVmConfig = {
    subscriptionId: "sub-123",
    resourceGroup: "test-rg",
    region: "eastus",
    profileName: "test-bot",
    keyVaultName: "test-vault",
    ...configOverrides,
  };

  const managers: AzureManagers = {
    networkManager: managerOverrides?.networkManager ?? networkManager,
    computeManager: managerOverrides?.computeManager ?? computeManager,
    sharedInfraManager: managerOverrides?.sharedInfraManager ?? sharedInfraManager,
  };

  const target = new AzureVmTarget({ config, managers });

  return { target, networkManager, computeManager, sharedInfraManager, config };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("AzureVmTarget", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create instance with default credentials", () => {
      const { target } = createTarget();
      expect(target.type).toBe(DeploymentTargetType.AZURE_VM);
    });

    it("should create instance with service principal credentials", () => {
      const { target } = createTarget({
        clientId: "client-123",
        clientSecret: "secret-123",
        tenantId: "tenant-123",
      });
      expect(target.type).toBe(DeploymentTargetType.AZURE_VM);
    });

    it("should accept config directly (backward compat)", () => {
      const target = new AzureVmTarget({
        subscriptionId: "sub-123",
        resourceGroup: "test-rg",
        region: "eastus",
      });
      expect(target.type).toBe(DeploymentTargetType.AZURE_VM);
    });
  });

  describe("install", () => {
    it("should install VM successfully with public IP", async () => {
      const { target, networkManager, computeManager } = createTarget();

      const result = await target.install({
        profileName: "test-bot",
        port: 18789,
      });

      expect(result.success).toBe(true);
      expect(result.instanceId).toBe("clawster-test-bot");
      expect(result.message).toContain("Azure VM");
      expect(result.message).toContain("20.30.40.50");

      // Verify network infra was set up
      expect(networkManager.ensureVNet).toHaveBeenCalledWith("clawster-vnet", "10.0.0.0/16");
      expect(networkManager.ensureNSG).toHaveBeenCalled();
      expect(networkManager.ensureVmSubnet).toHaveBeenCalled();

      // Verify public IP was created
      expect(networkManager.ensurePublicIp).toHaveBeenCalledWith("clawster-pip-test-bot");

      // Verify NIC was created with public IP
      expect(computeManager.createNic).toHaveBeenCalledWith(
        "clawster-nic-test-bot",
        "/subscriptions/xxx/subnets/vm-subnet",
        "/subscriptions/xxx/pip/clawster-pip-test-bot"
      );

      // Verify VM was created with no data disk + MI attached
      expect(computeManager.createVm).toHaveBeenCalledWith(
        "clawster-test-bot",
        "/subscriptions/xxx/nic/nic1",
        undefined, // No data disk
        "Standard_B2s",
        30,
        expect.stringContaining("#cloud-config"),
        undefined, // No SSH key
        { profile: "test-bot" },
        "/subscriptions/xxx/mi/clawster-mi" // Managed Identity
      );
    });

    it("should pass cloud-init with Caddy and Azure Files config", async () => {
      const { target, computeManager } = createTarget({
        storageAccountName: "mystorageacct",
        shareName: "myshare",
        managedIdentityClientId: "mi-client-id",
      });

      await target.install({ profileName: "test-bot", port: 18789 });

      const cloudInit = (computeManager.createVm as jest.Mock).mock.calls[0][5] as string;
      expect(cloudInit).toContain("#cloud-config");
      expect(cloudInit).toContain("cifs-utils");
      expect(cloudInit).toContain("mystorageacct");
      expect(cloudInit).toContain("myshare");
      expect(cloudInit).toContain("mi-client-id");
      expect(cloudInit).toContain("caddy");
      expect(cloudInit).toContain("reverse_proxy 127.0.0.1:18789");
      expect(cloudInit).toContain("sysbox");
    });

    it("should use custom domain in cloud-init when provided", async () => {
      const { target, computeManager } = createTarget({
        customDomain: "bot.example.com",
      });

      await target.install({ profileName: "test-bot", port: 18789 });

      const cloudInit = (computeManager.createVm as jest.Mock).mock.calls[0][5] as string;
      expect(cloudInit).toContain("bot.example.com");
    });

    it("should pass SSH public key when provided", async () => {
      const { target, computeManager } = createTarget({
        sshPublicKey: "ssh-rsa AAAAB3...",
      });

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(computeManager.createVm).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        undefined,
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        "ssh-rsa AAAAB3...",
        expect.any(Object),
        expect.any(String) // Managed Identity ID
      );
    });

    it("should provision shared infra (storage, MI) during install", async () => {
      const { target, sharedInfraManager } = createTarget();

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(sharedInfraManager.ensureStorageAccount).toHaveBeenCalled();
      expect(sharedInfraManager.ensureFileShare).toHaveBeenCalled();
      expect(sharedInfraManager.ensureManagedIdentity).toHaveBeenCalledWith("clawster-mi");
    });

    it("should provision KV and assign RBAC when tenantId is set", async () => {
      const { target, sharedInfraManager } = createTarget({
        tenantId: "tenant-123",
      });

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(sharedInfraManager.ensureKeyVault).toHaveBeenCalledWith(
        "test-vault",
        "tenant-123"
      );
      expect(sharedInfraManager.assignRoles).toHaveBeenCalledWith(
        "mi-principal-id",
        "/subscriptions/xxx/storageAccounts/clawstersa",
        "/subscriptions/xxx/vaults/test-vault"
      );
    });

    it("should skip KV and RBAC when tenantId is not set", async () => {
      const { target, sharedInfraManager } = createTarget();

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(sharedInfraManager.ensureKeyVault).not.toHaveBeenCalled();
      expect(sharedInfraManager.assignRoles).not.toHaveBeenCalled();
    });

    it("should return failure when shared infra provisioning fails", async () => {
      const { target, sharedInfraManager } = createTarget();
      (sharedInfraManager.ensureStorageAccount as jest.Mock)
        .mockRejectedValue(new Error("Storage quota exceeded"));

      const result = await target.install({ profileName: "test-bot", port: 18789 });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Storage quota exceeded");
    });

    it("should return failure on error", async () => {
      const { target, networkManager } = createTarget();
      (networkManager.ensureVNet as jest.Mock).mockRejectedValue(new Error("VNet creation failed"));

      const result = await target.install({ profileName: "test-bot", port: 18789 });

      expect(result.success).toBe(false);
      expect(result.message).toContain("VNet creation failed");
    });

    it("should use custom VNet/subnet/NSG names when provided", async () => {
      const { target, networkManager } = createTarget({
        vnetName: "custom-vnet",
        subnetName: "custom-subnet",
        nsgName: "custom-nsg",
      });

      await target.install({ profileName: "test-bot", port: 18789 });

      expect(networkManager.ensureVNet).toHaveBeenCalledWith("custom-vnet", expect.any(String));
      expect(networkManager.ensureVmSubnet).toHaveBeenCalledWith(
        "custom-vnet",
        "custom-subnet",
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe("getEndpoint", () => {
    it("should return public IP with HTTP when no custom domain", async () => {
      const { target } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      const endpoint = await target.getEndpoint();
      expect(endpoint.host).toBe("20.30.40.50");
      expect(endpoint.port).toBe(80);
      expect(endpoint.protocol).toBe("ws");
    });

    it("should return custom domain with HTTPS when configured", async () => {
      const { target } = createTarget({ customDomain: "bot.example.com" });
      await target.install({ profileName: "test-bot", port: 18789 });

      const endpoint = await target.getEndpoint();
      expect(endpoint.host).toBe("bot.example.com");
      expect(endpoint.port).toBe(443);
      expect(endpoint.protocol).toBe("wss");
    });

    it("should fetch public IP if not cached", async () => {
      const { target, networkManager } = createTarget();

      // Manually set resource names via install but clear the cached IP
      await target.install({ profileName: "test-bot", port: 18789 });
      // Access private field to clear cache
      (target as unknown as { cachedPublicIp: string }).cachedPublicIp = "";

      const endpoint = await target.getEndpoint();
      expect(networkManager.getPublicIpAddress).toHaveBeenCalledWith("clawster-pip-test-bot");
      expect(endpoint.host).toBe("20.30.40.50");
    });
  });

  describe("configure", () => {
    it("should write config to Azure Files mount via Run Command", async () => {
      const { target, computeManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      const result = await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {
          gateway: { auth: { token: "secret" } },
        },
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Configuration applied");
      expect(result.requiresRestart).toBe(false);

      // Verify Run Command was called
      expect(computeManager.runCommand).toHaveBeenCalledWith(
        "clawster-test-bot",
        expect.arrayContaining([
          expect.stringContaining("base64 -d > /mnt/openclaw/.openclaw/openclaw.json"),
        ])
      );
    });

    it("should transform config (gateway.bind = lan, remove port/host)", async () => {
      const { target, computeManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {
          gateway: {
            host: "localhost",
            port: 12345,
            auth: { token: "secret" },
          },
        },
      });

      // Extract the base64 config from the run command
      const runCommandArgs = (computeManager.runCommand as jest.Mock).mock.calls[0][1] as string[];
      const base64Match = runCommandArgs[0].match(/echo '([^']+)'/);
      expect(base64Match).toBeTruthy();
      const decoded = Buffer.from(base64Match![1], "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);

      expect(parsed.gateway.bind).toBe("lan");
      expect(parsed.gateway.host).toBeUndefined();
      expect(parsed.gateway.port).toBeUndefined();
      expect(parsed.gateway.auth).toEqual({ token: "secret" });
    });

    it("should return failure on error", async () => {
      const { target, computeManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      (computeManager.runCommand as jest.Mock).mockRejectedValue(new Error("VM unreachable"));

      const result = await target.configure({
        profileName: "test-bot",
        gatewayPort: 18789,
        config: {},
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("VM unreachable");
    });
  });

  describe("getStatus", () => {
    it("should return running when VM is running", async () => {
      const { target } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      const status = await target.getStatus();
      expect(status.state).toBe("running");
    });

    it("should return stopped when VM is deallocated", async () => {
      const { target, computeManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      (computeManager.getVmStatus as jest.Mock).mockResolvedValue("deallocated");

      const status = await target.getStatus();
      expect(status.state).toBe("stopped");
    });

    it("should return stopped when VM is stopped", async () => {
      const { target, computeManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      (computeManager.getVmStatus as jest.Mock).mockResolvedValue("stopped");

      const status = await target.getStatus();
      expect(status.state).toBe("stopped");
    });

    it("should return error for unknown state", async () => {
      const { target, computeManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      (computeManager.getVmStatus as jest.Mock).mockResolvedValue("unknown");

      const status = await target.getStatus();
      expect(status.state).toBe("error");
    });

    it("should return not-installed when VM is 404", async () => {
      const { target, computeManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      (computeManager.getVmStatus as jest.Mock).mockRejectedValue({ statusCode: 404 });

      const status = await target.getStatus();
      expect(status.state).toBe("not-installed");
    });
  });

  describe("lifecycle (start/stop/restart)", () => {
    it("should start the VM", async () => {
      const { target, computeManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      await target.start();
      expect(computeManager.startVm).toHaveBeenCalledWith("clawster-test-bot");
    });

    it("should stop (deallocate) the VM", async () => {
      const { target, computeManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      await target.stop();
      expect(computeManager.stopVm).toHaveBeenCalledWith("clawster-test-bot");
    });

    it("should restart the VM", async () => {
      const { target, computeManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      await target.restart();
      expect(computeManager.restartVm).toHaveBeenCalledWith("clawster-test-bot");
    });
  });

  describe("getLogs", () => {
    it("should return logs via Run Command", async () => {
      const { target, computeManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      (computeManager.runCommand as jest.Mock).mockResolvedValue("line1\nline2\nline3");

      const logs = await target.getLogs({ lines: 50 });
      expect(Array.isArray(logs)).toBe(true);
      expect(logs).toHaveLength(3);
      expect(computeManager.runCommand).toHaveBeenCalledWith(
        "clawster-test-bot",
        [expect.stringContaining("docker logs openclaw-gateway --tail 50")]
      );
    });

    it("should filter logs when filter option is provided", async () => {
      const { target, computeManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      (computeManager.runCommand as jest.Mock).mockResolvedValue(
        "Error: something failed\nInfo: all good\nError: another failure"
      );

      const logs = await target.getLogs({ filter: "Error" });
      expect(logs).toHaveLength(2);
      expect(logs.every((line) => line.includes("Error"))).toBe(true);
    });

    it("should return empty array on error", async () => {
      const { target, computeManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      (computeManager.runCommand as jest.Mock).mockRejectedValue(new Error("VM unreachable"));

      const logs = await target.getLogs();
      expect(logs).toEqual([]);
    });
  });

  describe("destroy", () => {
    it("should destroy all per-bot resources in correct order", async () => {
      const { target, computeManager, networkManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      const deleteOrder: string[] = [];
      (computeManager.deleteVm as jest.Mock).mockImplementation(() => {
        deleteOrder.push("vm");
        return Promise.resolve();
      });
      (computeManager.deleteNic as jest.Mock).mockImplementation(() => {
        deleteOrder.push("nic");
        return Promise.resolve();
      });
      (computeManager.deleteDisk as jest.Mock).mockImplementation(() => {
        deleteOrder.push("disk");
        return Promise.resolve();
      });
      (networkManager.deletePublicIp as jest.Mock).mockImplementation(() => {
        deleteOrder.push("pip");
        return Promise.resolve();
      });

      await target.destroy();

      // VM → NIC → OS disk → Public IP
      expect(deleteOrder).toEqual(["vm", "nic", "disk", "pip"]);

      expect(computeManager.deleteVm).toHaveBeenCalledWith("clawster-test-bot");
      expect(computeManager.deleteNic).toHaveBeenCalledWith("clawster-nic-test-bot");
      expect(computeManager.deleteDisk).toHaveBeenCalledWith("clawster-test-bot-osdisk");
      expect(networkManager.deletePublicIp).toHaveBeenCalledWith("clawster-pip-test-bot");
    });

    it("should not delete shared resources (VNet, NSG)", async () => {
      const { target, networkManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      await target.destroy();

      expect(networkManager.deleteVNet).not.toHaveBeenCalled();
      expect(networkManager.deleteNSG).not.toHaveBeenCalled();
    });
  });

  describe("updateResources", () => {
    it("should deallocate, resize, and start VM", async () => {
      const { target, computeManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      const callOrder: string[] = [];
      (computeManager.stopVm as jest.Mock).mockImplementation(() => {
        callOrder.push("stop");
        return Promise.resolve();
      });
      (computeManager.resizeVm as jest.Mock).mockImplementation(() => {
        callOrder.push("resize");
        return Promise.resolve();
      });
      (computeManager.startVm as jest.Mock).mockImplementation(() => {
        callOrder.push("start");
        return Promise.resolve();
      });

      const result = await target.updateResources({ cpu: 2048, memory: 8192, dataDiskSizeGb: 0 });

      expect(result.success).toBe(true);
      expect(callOrder).toEqual(["stop", "resize", "start"]);
      expect(computeManager.resizeVm).toHaveBeenCalledWith("clawster-test-bot", "Standard_D2s_v3");
    });

    it("should attempt recovery on failure", async () => {
      const { target, computeManager } = createTarget();
      await target.install({ profileName: "test-bot", port: 18789 });

      (computeManager.resizeVm as jest.Mock).mockRejectedValue(new Error("Resize failed"));

      const result = await target.updateResources({ cpu: 2048, memory: 8192, dataDiskSizeGb: 0 });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Resize failed");
      // Should try to start VM as recovery
      expect(computeManager.startVm).toHaveBeenCalled();
    });
  });

  describe("getMetadata", () => {
    it("should return correct metadata for Caddy architecture", () => {
      const { target } = createTarget();
      const metadata = target.getMetadata();

      expect(metadata.type).toBe(DeploymentTargetType.AZURE_VM);
      expect(metadata.displayName).toContain("Azure");
      expect(metadata.description).toContain("Caddy");
      expect(metadata.capabilities.sandbox).toBe(true);
      expect(metadata.capabilities.persistentStorage).toBe(true);
      expect(metadata.capabilities.httpsEndpoint).toBe(true);

      // Verify provisioning steps include shared infra + Caddy-specific steps
      const stepIds = metadata.provisioningSteps.map((s) => s.id);
      expect(stepIds).toContain("create_storage");
      expect(stepIds).toContain("create_identity");
      expect(stepIds).toContain("create_keyvault");
      expect(stepIds).toContain("assign_roles");
      expect(stepIds).toContain("create_public_ip");
      expect(stepIds).toContain("cloud_init");
      expect(stepIds).toContain("mount_azure_files");
      expect(stepIds).toContain("start_openclaw");

      // Verify tier specs
      expect(metadata.tierSpecs).toBeDefined();
      expect(metadata.tierSpecs!.light.vmSize).toBe("Standard_B1ms");
      expect(metadata.tierSpecs!.standard.vmSize).toBe("Standard_B2s");
      expect(metadata.tierSpecs!.performance.vmSize).toBe("Standard_D2s_v3");
    });
  });
});
