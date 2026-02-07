/**
 * Unit Tests - CredentialVaultService
 */
import { NotFoundException } from "@nestjs/common";
import { CredentialVaultService } from "../credential-vault.service";
import { CredentialEncryptionService } from "../credential-encryption.service";
import { IConnectorRepository } from "@clawster/database";

const mockConnectorRepo = {
  createConnector: jest.fn(),
  findManyConnectors: jest.fn(),
  findConnectorById: jest.fn(),
  incrementUsageCount: jest.fn(),
  deleteConnector: jest.fn(),
  findConnectorsByWorkspace: jest.fn(),
  countConnectors: jest.fn(),
  updateConnector: jest.fn(),
  updateConnectorStatus: jest.fn(),
  recordTestResult: jest.fn(),
  findBindingById: jest.fn(),
  findBindingsByBotInstance: jest.fn(),
  findBindingsByConnector: jest.fn(),
  createBinding: jest.fn(),
  updateBinding: jest.fn(),
  deleteBinding: jest.fn(),
  updateBindingHealth: jest.fn(),
};

const mockEncryption = {
  encrypt: jest.fn((obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString("base64"),
  ),
  decrypt: jest.fn((b64: string) =>
    JSON.parse(Buffer.from(b64, "base64").toString()),
  ),
  mask: jest.fn((type: string, config: Record<string, unknown>) => {
    if (type === "aws-account") {
      return {
        accessKeyId: "AKIA••••XXXX",
        secretAccessKey: "••••••••",
        region: config.region,
      };
    }
    return { provider: config.provider, apiKey: "sk-ant-••••XXXX" };
  }),
} as unknown as CredentialEncryptionService;

describe("CredentialVaultService", () => {
  let service: CredentialVaultService;

  beforeEach(() => {
    service = new CredentialVaultService(
      mockConnectorRepo as unknown as IConnectorRepository,
      mockEncryption,
    );
    jest.clearAllMocks();
  });

  describe("save", () => {
    it("encrypts credentials and creates connector", async () => {
      const now = new Date();
      mockConnectorRepo.createConnector.mockResolvedValue({
        id: "cred-1",
        name: "My AWS Creds",
        type: "aws-account",
        config: "encrypted-base64",
        workspaceId: "ws-1",
        createdAt: now,
      });

      const dto = {
        workspaceId: "ws-1",
        name: "My AWS Creds",
        type: "aws-account",
        credentials: {
          accessKeyId: "AKIAIOSFODNN7EXAMPLE",
          secretAccessKey: "secret",
          region: "us-east-1",
        },
      };

      const result = await service.save(dto, "user-1");

      expect(mockEncryption.encrypt).toHaveBeenCalledWith(dto.credentials);
      expect(mockConnectorRepo.createConnector).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: { connect: { id: "ws-1" } },
          name: "My AWS Creds",
          type: "aws-account",
          createdBy: "user-1",
        }),
      );
      expect(result).toHaveProperty("id", "cred-1");
      expect(result).toHaveProperty("maskedConfig");
    });
  });

  describe("listSaved", () => {
    it("returns masked credentials", async () => {
      const credentials = { accessKeyId: "AKIA1234", secretAccessKey: "sec", region: "us-east-1" };
      const encryptedConfig = Buffer.from(JSON.stringify(credentials)).toString("base64");

      mockConnectorRepo.findManyConnectors.mockResolvedValue({
        data: [
          {
            id: "cred-1",
            name: "Cred One",
            type: "aws-account",
            config: encryptedConfig,
            tags: JSON.stringify({ credentialVault: true }),
            createdAt: new Date(),
          },
          {
            id: "cred-2",
            name: "Cred Two",
            type: "aws-account",
            config: encryptedConfig,
            tags: JSON.stringify({ credentialVault: true }),
            createdAt: new Date(),
          },
        ],
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const result = await service.listSaved({ workspaceId: "ws-1" });

      expect(result).toHaveLength(2);
      expect(mockEncryption.decrypt).toHaveBeenCalledTimes(2);
      expect(mockEncryption.mask).toHaveBeenCalledTimes(2);
      expect(result[0].maskedConfig).toEqual(
        expect.objectContaining({ accessKeyId: "AKIA••••XXXX" }),
      );
    });
  });

  describe("resolve", () => {
    it("returns decrypted credentials and increments usage", async () => {
      const credentials = { accessKeyId: "AKIA1234", secretAccessKey: "sec", region: "us-east-1" };
      const encryptedConfig = Buffer.from(JSON.stringify(credentials)).toString("base64");

      mockConnectorRepo.findConnectorById.mockResolvedValue({
        id: "cred-1",
        name: "My Cred",
        type: "aws-account",
        config: encryptedConfig,
        workspaceId: "ws-1",
      });
      mockConnectorRepo.incrementUsageCount.mockResolvedValue({});

      const result = await service.resolve("cred-1", "ws-1");

      expect(mockEncryption.decrypt).toHaveBeenCalledWith(encryptedConfig);
      expect(mockConnectorRepo.incrementUsageCount).toHaveBeenCalledWith("cred-1");
      expect(result).toEqual(credentials);
    });

    it("throws NotFoundException for missing credential", async () => {
      mockConnectorRepo.findConnectorById.mockResolvedValue(null);

      await expect(service.resolve("non-existent", "ws-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws NotFoundException when workspace does not match", async () => {
      mockConnectorRepo.findConnectorById.mockResolvedValue({
        id: "cred-1",
        name: "My Cred",
        type: "aws-account",
        config: "encrypted",
        workspaceId: "ws-OTHER",
      });

      await expect(service.resolve("cred-1", "ws-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("save — validation", () => {
    it("rejects azure-account missing subscriptionId", async () => {
      const dto = {
        workspaceId: "ws-1",
        name: "Bad Azure",
        type: "azure-account",
        credentials: { resourceGroup: "my-rg" },
      };

      await expect(service.save(dto, "user-1")).rejects.toThrow("subscriptionId");
    });

    it("rejects azure-account missing resourceGroup", async () => {
      const dto = {
        workspaceId: "ws-1",
        name: "Bad Azure",
        type: "azure-account",
        credentials: { subscriptionId: "sub-123" },
      };

      await expect(service.save(dto, "user-1")).rejects.toThrow("resourceGroup");
    });

    it("rejects gce-account missing projectId", async () => {
      const dto = {
        workspaceId: "ws-1",
        name: "Bad GCE",
        type: "gce-account",
        credentials: { zone: "us-central1-a" },
      };

      await expect(service.save(dto, "user-1")).rejects.toThrow("projectId");
    });

    it("accepts valid azure-account credentials", async () => {
      const now = new Date();
      mockConnectorRepo.createConnector.mockResolvedValue({
        id: "cred-az",
        name: "My Azure",
        type: "azure-account",
        config: "encrypted",
        workspaceId: "ws-1",
        createdAt: now,
      });

      const dto = {
        workspaceId: "ws-1",
        name: "My Azure",
        type: "azure-account",
        credentials: {
          subscriptionId: "sub-123",
          resourceGroup: "my-rg",
          region: "eastus",
        },
      };

      const result = await service.save(dto, "user-1");
      expect(result).toHaveProperty("id", "cred-az");
    });

    it("accepts valid gce-account credentials", async () => {
      const now = new Date();
      mockConnectorRepo.createConnector.mockResolvedValue({
        id: "cred-gce",
        name: "My GCE",
        type: "gce-account",
        config: "encrypted",
        workspaceId: "ws-1",
        createdAt: now,
      });

      const dto = {
        workspaceId: "ws-1",
        name: "My GCE",
        type: "gce-account",
        credentials: {
          projectId: "my-project",
          zone: "us-central1-a",
        },
      };

      const result = await service.save(dto, "user-1");
      expect(result).toHaveProperty("id", "cred-gce");
    });
  });

  describe("delete", () => {
    it("removes credential", async () => {
      mockConnectorRepo.findConnectorById.mockResolvedValue({
        id: "cred-1",
        name: "My Cred",
        type: "aws-account",
        workspaceId: "ws-1",
      });
      mockConnectorRepo.deleteConnector.mockResolvedValue(undefined);

      await service.delete("cred-1", "ws-1");

      expect(mockConnectorRepo.deleteConnector).toHaveBeenCalledWith("cred-1");
    });
  });
});
