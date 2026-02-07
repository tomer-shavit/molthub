import { AzureSharedInfraManager, deriveSharedInfraNames } from "../azure-shared-infra-manager";
import type { AzureLogCallback } from "../../types";

// ── Mock SDK Clients ─────────────────────────────────────────────────────

function createMockStorageClient() {
  return {
    storageAccounts: {
      getProperties: jest.fn(),
      beginCreateAndWait: jest.fn(),
    },
    fileShares: {
      get: jest.fn(),
      create: jest.fn(),
    },
  };
}

function createMockKvMgmtClient() {
  return {
    vaults: {
      get: jest.fn(),
      beginCreateOrUpdateAndWait: jest.fn(),
    },
  };
}

function createMockMsiClient() {
  return {
    userAssignedIdentities: {
      get: jest.fn(),
      createOrUpdate: jest.fn(),
    },
  };
}

function createMockAuthClient() {
  return {
    roleAssignments: {
      create: jest.fn(),
    },
  };
}

function createManager(overrides?: {
  storageClient?: ReturnType<typeof createMockStorageClient>;
  kvMgmtClient?: ReturnType<typeof createMockKvMgmtClient>;
  msiClient?: ReturnType<typeof createMockMsiClient>;
  authClient?: ReturnType<typeof createMockAuthClient>;
}) {
  const storageClient = overrides?.storageClient ?? createMockStorageClient();
  const kvMgmtClient = overrides?.kvMgmtClient ?? createMockKvMgmtClient();
  const msiClient = overrides?.msiClient ?? createMockMsiClient();
  const authClient = overrides?.authClient ?? createMockAuthClient();
  const log: AzureLogCallback = jest.fn();

  const manager = new AzureSharedInfraManager(
    storageClient as never,
    kvMgmtClient as never,
    msiClient as never,
    authClient as never,
    "sub-123",
    "test-rg",
    "eastus",
    log
  );

  return { manager, storageClient, kvMgmtClient, msiClient, authClient, log };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("AzureSharedInfraManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("ensureStorageAccount", () => {
    it("should return existing storage account if found", async () => {
      const { manager, storageClient } = createManager();
      storageClient.storageAccounts.getProperties.mockResolvedValue({
        id: "/subscriptions/sub-123/storageAccounts/mysa",
        name: "mysa",
      });

      const result = await manager.ensureStorageAccount("mysa");

      expect(result).toEqual({ id: "/subscriptions/sub-123/storageAccounts/mysa", name: "mysa" });
      expect(storageClient.storageAccounts.beginCreateAndWait).not.toHaveBeenCalled();
    });

    it("should create storage account on 404", async () => {
      const { manager, storageClient } = createManager();
      storageClient.storageAccounts.getProperties.mockRejectedValue({ statusCode: 404 });
      storageClient.storageAccounts.beginCreateAndWait.mockResolvedValue({
        id: "/subscriptions/sub-123/storageAccounts/mysa",
        name: "mysa",
      });

      const result = await manager.ensureStorageAccount("mysa");

      expect(result).toEqual({ id: "/subscriptions/sub-123/storageAccounts/mysa", name: "mysa" });
      expect(storageClient.storageAccounts.beginCreateAndWait).toHaveBeenCalledWith(
        "test-rg",
        "mysa",
        expect.objectContaining({
          location: "eastus",
          sku: { name: "Standard_LRS" },
          kind: "StorageV2",
          tags: { managedBy: "clawster" },
        })
      );
    });

    it("should re-throw non-404 errors", async () => {
      const { manager, storageClient } = createManager();
      storageClient.storageAccounts.getProperties.mockRejectedValue({ statusCode: 403 });

      await expect(manager.ensureStorageAccount("mysa")).rejects.toEqual({ statusCode: 403 });
    });
  });

  describe("ensureFileShare", () => {
    it("should skip creation if share exists", async () => {
      const { manager, storageClient } = createManager();
      storageClient.fileShares.get.mockResolvedValue({});

      await manager.ensureFileShare("mysa", "myshare");

      expect(storageClient.fileShares.create).not.toHaveBeenCalled();
    });

    it("should create file share on 404", async () => {
      const { manager, storageClient } = createManager();
      storageClient.fileShares.get.mockRejectedValue({ statusCode: 404 });
      storageClient.fileShares.create.mockResolvedValue({});

      await manager.ensureFileShare("mysa", "myshare");

      expect(storageClient.fileShares.create).toHaveBeenCalledWith(
        "test-rg",
        "mysa",
        "myshare",
        {}
      );
    });
  });

  describe("ensureManagedIdentity", () => {
    it("should return existing MI if found", async () => {
      const { manager, msiClient } = createManager();
      msiClient.userAssignedIdentities.get.mockResolvedValue({
        id: "/subscriptions/sub-123/mi/clawster-mi",
        clientId: "mi-client-id",
        principalId: "mi-principal-id",
      });

      const result = await manager.ensureManagedIdentity("clawster-mi");

      expect(result).toEqual({
        id: "/subscriptions/sub-123/mi/clawster-mi",
        clientId: "mi-client-id",
        principalId: "mi-principal-id",
      });
      expect(msiClient.userAssignedIdentities.createOrUpdate).not.toHaveBeenCalled();
    });

    it("should create MI on 404", async () => {
      const { manager, msiClient } = createManager();
      msiClient.userAssignedIdentities.get.mockRejectedValue({ statusCode: 404 });
      msiClient.userAssignedIdentities.createOrUpdate.mockResolvedValue({
        id: "/subscriptions/sub-123/mi/clawster-mi",
        clientId: "new-client-id",
        principalId: "new-principal-id",
      });

      const result = await manager.ensureManagedIdentity("clawster-mi");

      expect(result.clientId).toBe("new-client-id");
      expect(result.principalId).toBe("new-principal-id");
      expect(msiClient.userAssignedIdentities.createOrUpdate).toHaveBeenCalledWith(
        "test-rg",
        "clawster-mi",
        expect.objectContaining({
          location: "eastus",
          tags: { managedBy: "clawster" },
        })
      );
    });
  });

  describe("ensureKeyVault", () => {
    it("should return existing vault if found", async () => {
      const { manager, kvMgmtClient } = createManager();
      kvMgmtClient.vaults.get.mockResolvedValue({
        id: "/subscriptions/sub-123/vaults/mykv",
        name: "mykv",
        properties: { vaultUri: "https://mykv.vault.azure.net" },
      });

      const result = await manager.ensureKeyVault("mykv", "tenant-123");

      expect(result).toEqual({
        id: "/subscriptions/sub-123/vaults/mykv",
        name: "mykv",
        uri: "https://mykv.vault.azure.net",
      });
      expect(kvMgmtClient.vaults.beginCreateOrUpdateAndWait).not.toHaveBeenCalled();
    });

    it("should create vault with RBAC enabled on 404", async () => {
      const { manager, kvMgmtClient } = createManager();
      kvMgmtClient.vaults.get.mockRejectedValue({ statusCode: 404 });
      kvMgmtClient.vaults.beginCreateOrUpdateAndWait.mockResolvedValue({
        id: "/subscriptions/sub-123/vaults/mykv",
        name: "mykv",
        properties: { vaultUri: "https://mykv.vault.azure.net" },
      });

      const result = await manager.ensureKeyVault("mykv", "tenant-123");

      expect(result.uri).toBe("https://mykv.vault.azure.net");
      expect(kvMgmtClient.vaults.beginCreateOrUpdateAndWait).toHaveBeenCalledWith(
        "test-rg",
        "mykv",
        expect.objectContaining({
          location: "eastus",
          properties: expect.objectContaining({
            tenantId: "tenant-123",
            enableRbacAuthorization: true,
            sku: { family: "A", name: "standard" },
          }),
        })
      );
    });
  });

  describe("assignRoles", () => {
    it("should assign Storage Key Operator and KV Secrets User roles", async () => {
      const { manager, authClient } = createManager();
      authClient.roleAssignments.create.mockResolvedValue({});

      await manager.assignRoles(
        "principal-123",
        "/subscriptions/sub-123/storageAccounts/mysa",
        "/subscriptions/sub-123/vaults/mykv"
      );

      expect(authClient.roleAssignments.create).toHaveBeenCalledTimes(2);

      // First call: Storage Key Operator
      const [storageScope, , storageParams] = authClient.roleAssignments.create.mock.calls[0];
      expect(storageScope).toBe("/subscriptions/sub-123/storageAccounts/mysa");
      expect(storageParams.principalId).toBe("principal-123");
      expect(storageParams.roleDefinitionId).toContain("81a9662b-bebf-436f-a333-f67b29880f12");

      // Second call: KV Secrets User
      const [kvScope, , kvParams] = authClient.roleAssignments.create.mock.calls[1];
      expect(kvScope).toBe("/subscriptions/sub-123/vaults/mykv");
      expect(kvParams.principalId).toBe("principal-123");
      expect(kvParams.roleDefinitionId).toContain("4633458b-17de-408a-b874-0445c86b69e6");
    });

    it("should silently handle 409 conflict (already assigned)", async () => {
      const { manager, authClient } = createManager();
      authClient.roleAssignments.create.mockRejectedValue({ statusCode: 409 });

      await expect(
        manager.assignRoles(
          "principal-123",
          "/subscriptions/sub-123/storageAccounts/mysa",
          "/subscriptions/sub-123/vaults/mykv"
        )
      ).resolves.toBeUndefined();
    });

    it("should re-throw non-409 errors", async () => {
      const { manager, authClient } = createManager();
      authClient.roleAssignments.create.mockRejectedValue({ statusCode: 403 });

      await expect(
        manager.assignRoles(
          "principal-123",
          "/subscriptions/sub-123/storageAccounts/mysa",
          "/subscriptions/sub-123/vaults/mykv"
        )
      ).rejects.toEqual({ statusCode: 403 });
    });

    it("should use deterministic assignment names for idempotency", async () => {
      const { manager, authClient } = createManager();
      authClient.roleAssignments.create.mockResolvedValue({});

      // Call twice with the same args
      await manager.assignRoles("principal-123", "/sa/id", "/kv/id");
      await manager.assignRoles("principal-123", "/sa/id", "/kv/id");

      // Assignment names should be identical between calls
      const firstName1 = authClient.roleAssignments.create.mock.calls[0][1];
      const firstName2 = authClient.roleAssignments.create.mock.calls[2][1];
      expect(firstName1).toBe(firstName2);
    });
  });
});

describe("deriveSharedInfraNames", () => {
  it("should produce deterministic names", () => {
    const a = deriveSharedInfraNames("sub-123", "rg-1");
    const b = deriveSharedInfraNames("sub-123", "rg-1");
    expect(a).toEqual(b);
  });

  it("should produce different names for different inputs", () => {
    const a = deriveSharedInfraNames("sub-123", "rg-1");
    const b = deriveSharedInfraNames("sub-456", "rg-1");
    expect(a.storageAccountName).not.toBe(b.storageAccountName);
    expect(a.keyVaultName).not.toBe(b.keyVaultName);
  });

  it("should produce valid Azure resource names", () => {
    const names = deriveSharedInfraNames("sub-123", "rg-1");

    // Storage account: 3-24 chars, lowercase alphanumeric only
    expect(names.storageAccountName).toMatch(/^[a-z0-9]{3,24}$/);

    // Key vault: 3-24 chars, start with letter, alphanumeric and hyphens
    expect(names.keyVaultName).toMatch(/^[a-z][a-z0-9-]{2,23}$/);

    // MI: alphanumeric and hyphens, 3-128 chars
    expect(names.managedIdentityName).toMatch(/^[a-z][a-z0-9-]{2,127}$/);
  });
});
