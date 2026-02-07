import { LocalVaultStore } from "../stores/local-vault-store";

describe("LocalVaultStore", () => {
  let store: LocalVaultStore;
  let mockPrisma: {
    botVaultSecret: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let mockEncryption: { encrypt: jest.Mock; decrypt: jest.Mock };

  beforeEach(() => {
    mockPrisma = {
      botVaultSecret: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    mockEncryption = {
      encrypt: jest.fn((obj) => Buffer.from(JSON.stringify(obj)).toString("base64")),
      decrypt: jest.fn((str) => JSON.parse(Buffer.from(str, "base64").toString())),
    };

    store = new LocalVaultStore(mockPrisma as any, mockEncryption as any);
  });

  describe("storeSecret", () => {
    it("encrypts value before storing", async () => {
      await store.storeSecret("inst-1", "API_KEY", "sk-abc123");

      expect(mockEncryption.encrypt).toHaveBeenCalledWith({ value: "sk-abc123" });
    });

    it("upserts with compound key", async () => {
      await store.storeSecret("inst-1", "API_KEY", "sk-abc123");

      expect(mockPrisma.botVaultSecret.upsert).toHaveBeenCalledWith({
        where: { botInstanceId_key: { botInstanceId: "inst-1", key: "API_KEY" } },
        create: expect.objectContaining({
          botInstanceId: "inst-1",
          key: "API_KEY",
          encryptedValue: expect.any(String),
        }),
        update: expect.objectContaining({
          encryptedValue: expect.any(String),
        }),
      });
    });
  });

  describe("getSecret", () => {
    it("returns decrypted value when secret exists", async () => {
      const encrypted = Buffer.from(JSON.stringify({ value: "my-secret" })).toString("base64");
      mockPrisma.botVaultSecret.findUnique.mockResolvedValue({ encryptedValue: encrypted });

      const result = await store.getSecret("inst-1", "API_KEY");

      expect(result).toBe("my-secret");
      expect(mockEncryption.decrypt).toHaveBeenCalledWith(encrypted);
    });

    it("returns undefined when secret does not exist", async () => {
      mockPrisma.botVaultSecret.findUnique.mockResolvedValue(null);

      const result = await store.getSecret("inst-1", "MISSING_KEY");

      expect(result).toBeUndefined();
      expect(mockEncryption.decrypt).not.toHaveBeenCalled();
    });

    it("queries with compound key", async () => {
      mockPrisma.botVaultSecret.findUnique.mockResolvedValue(null);

      await store.getSecret("inst-1", "API_KEY");

      expect(mockPrisma.botVaultSecret.findUnique).toHaveBeenCalledWith({
        where: { botInstanceId_key: { botInstanceId: "inst-1", key: "API_KEY" } },
      });
    });
  });

  describe("deleteSecret", () => {
    it("deletes by instance id and key", async () => {
      await store.deleteSecret("inst-1", "API_KEY");

      expect(mockPrisma.botVaultSecret.deleteMany).toHaveBeenCalledWith({
        where: { botInstanceId: "inst-1", key: "API_KEY" },
      });
    });
  });
});
