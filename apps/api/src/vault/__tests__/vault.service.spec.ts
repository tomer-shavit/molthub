import { VaultService } from "../vault.service";

describe("VaultService", () => {
  let service: VaultService;
  let mockBotInstanceRepo: { findById: jest.Mock };
  let mockPrisma: { deploymentTarget: { findUnique: jest.Mock }; botVaultSecret: Record<string, jest.Mock> };
  let mockEncryption: { encrypt: jest.Mock; decrypt: jest.Mock };

  beforeEach(() => {
    mockBotInstanceRepo = {
      findById: jest.fn(),
    };
    mockPrisma = {
      deploymentTarget: { findUnique: jest.fn() },
      botVaultSecret: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    mockEncryption = {
      encrypt: jest.fn((obj) => JSON.stringify(obj)),
      decrypt: jest.fn((str) => JSON.parse(str)),
    };

    service = new VaultService(
      mockBotInstanceRepo as any,
      mockPrisma as any,
      mockEncryption as any,
    );
  });

  describe("storeSecret", () => {
    it("routes LOCAL deployment to LocalVaultStore and stores encrypted secret", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "inst-1",
        deploymentType: "LOCAL",
        deploymentTargetId: null,
        metadata: null,
      });
      mockPrisma.botVaultSecret.upsert.mockResolvedValue({});

      await service.storeSecret("inst-1", "MY_KEY", "my-secret");

      expect(mockBotInstanceRepo.findById).toHaveBeenCalledWith("inst-1");
      expect(mockPrisma.botVaultSecret.upsert).toHaveBeenCalledWith({
        where: { botInstanceId_key: { botInstanceId: "inst-1", key: "MY_KEY" } },
        create: expect.objectContaining({ botInstanceId: "inst-1", key: "MY_KEY" }),
        update: expect.objectContaining({ encryptedValue: expect.any(String) }),
      });
    });

    it("routes DOCKER deployment to LocalVaultStore", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "inst-2",
        deploymentType: "DOCKER",
        deploymentTargetId: null,
        metadata: null,
      });
      mockPrisma.botVaultSecret.upsert.mockResolvedValue({});

      await service.storeSecret("inst-2", "TOKEN", "val");

      expect(mockPrisma.botVaultSecret.upsert).toHaveBeenCalled();
    });

    it("throws when instance not found", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue(null);

      await expect(service.storeSecret("missing", "K", "V")).rejects.toThrow(
        "BotInstance missing not found",
      );
    });
  });

  describe("getSecret", () => {
    it("returns decrypted secret for LOCAL deployment", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "inst-1",
        deploymentType: "LOCAL",
        deploymentTargetId: null,
        metadata: null,
      });
      mockPrisma.botVaultSecret.findUnique.mockResolvedValue({
        encryptedValue: JSON.stringify({ value: "secret-val" }),
      });

      const result = await service.getSecret("inst-1", "MY_KEY");

      expect(result).toBe("secret-val");
    });

    it("returns undefined when secret not found", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "inst-1",
        deploymentType: "LOCAL",
        deploymentTargetId: null,
        metadata: null,
      });
      mockPrisma.botVaultSecret.findUnique.mockResolvedValue(null);

      const result = await service.getSecret("inst-1", "MISSING");

      expect(result).toBeUndefined();
    });
  });

  describe("deleteSecret", () => {
    it("deletes secret for LOCAL deployment", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "inst-1",
        deploymentType: "LOCAL",
        deploymentTargetId: null,
        metadata: null,
      });
      mockPrisma.botVaultSecret.deleteMany.mockResolvedValue({ count: 1 });

      await service.deleteSecret("inst-1", "MY_KEY");

      expect(mockPrisma.botVaultSecret.deleteMany).toHaveBeenCalledWith({
        where: { botInstanceId: "inst-1", key: "MY_KEY" },
      });
    });
  });

  describe("cloud config resolution", () => {
    it("reads config from deployment target when available", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "inst-1",
        deploymentType: "LOCAL",
        deploymentTargetId: "dt-1",
        metadata: null,
      });
      mockPrisma.deploymentTarget.findUnique.mockResolvedValue({
        config: JSON.stringify({ region: "eu-west-1" }),
      });
      mockPrisma.botVaultSecret.upsert.mockResolvedValue({});

      await service.storeSecret("inst-1", "K", "V");

      expect(mockPrisma.deploymentTarget.findUnique).toHaveBeenCalledWith({
        where: { id: "dt-1" },
      });
    });

    it("falls back to instance metadata when no deployment target", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "inst-1",
        deploymentType: "LOCAL",
        deploymentTargetId: null,
        metadata: JSON.stringify({ region: "us-west-2" }),
      });
      mockPrisma.botVaultSecret.upsert.mockResolvedValue({});

      await service.storeSecret("inst-1", "K", "V");

      expect(mockPrisma.deploymentTarget.findUnique).not.toHaveBeenCalled();
    });

    it("handles null deployment type as LOCAL", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "inst-1",
        deploymentType: null,
        deploymentTargetId: null,
        metadata: null,
      });
      mockPrisma.botVaultSecret.upsert.mockResolvedValue({});

      await service.storeSecret("inst-1", "K", "V");

      expect(mockPrisma.botVaultSecret.upsert).toHaveBeenCalled();
    });
  });
});
