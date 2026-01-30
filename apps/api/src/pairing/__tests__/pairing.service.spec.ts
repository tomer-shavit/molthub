import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { PairingService } from "../pairing.service";

// Mock GatewayManager
const mockConfigGet = jest.fn();
const mockConfigPatch = jest.fn();
const mockGetClient = jest.fn();

jest.mock("@molthub/gateway-client", () => ({
  GatewayManager: jest.fn().mockImplementation(() => ({
    getClient: mockGetClient,
  })),
}));

jest.mock("@molthub/database", () => ({
  prisma: {
    devicePairing: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
    },
    botInstance: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    gatewayConnection: {
      findUnique: jest.fn(),
    },
  },
}));

const { prisma } = require("@molthub/database");

describe("PairingService", () => {
  let service: PairingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PairingService],
    }).compile();

    service = module.get<PairingService>(PairingService);
    jest.clearAllMocks();

    // Default: Gateway client returns valid config
    mockConfigGet.mockResolvedValue({
      config: {
        channels: {
          whatsapp: { allowFrom: ["existing-user"] },
        },
      },
      hash: "hash-123",
    });
    mockConfigPatch.mockResolvedValue({ ok: true });
    mockGetClient.mockResolvedValue({
      configGet: mockConfigGet,
      configPatch: mockConfigPatch,
    });

    // Default: instance exists for gateway lookups
    prisma.botInstance.findUnique.mockResolvedValue({ id: "bot-1", gatewayPort: 18789 });
    prisma.gatewayConnection.findUnique.mockResolvedValue({
      host: "localhost",
      port: 18789,
      authToken: "test-token",
    });
  });

  describe("verifyInstanceExists", () => {
    it("resolves when instance exists", async () => {
      prisma.botInstance.findFirst.mockResolvedValue({ id: "bot-1" });

      await expect(service.verifyInstanceExists("bot-1")).resolves.toBeUndefined();
      expect(prisma.botInstance.findFirst).toHaveBeenCalledWith({
        where: { id: "bot-1" },
        select: { id: true },
      });
    });

    it("throws NotFoundException when instance does not exist", async () => {
      prisma.botInstance.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyInstanceExists("nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("listPairings", () => {
    it("returns all pairings for an instance", async () => {
      const mockPairings = [
        { id: "p1", instanceId: "bot-1", state: "PENDING", senderId: "user-1" },
        { id: "p2", instanceId: "bot-1", state: "APPROVED", senderId: "user-2" },
      ];

      prisma.devicePairing.findMany.mockResolvedValue(mockPairings);

      const result = await service.listPairings("bot-1");
      expect(result).toEqual(mockPairings);
      expect(prisma.devicePairing.findMany).toHaveBeenCalledWith({
        where: { instanceId: "bot-1" },
        orderBy: { createdAt: "desc" },
      });
    });

    it("returns filtered pairings when state is provided", async () => {
      const mockPairings = [
        { id: "p1", instanceId: "bot-1", state: "PENDING", senderId: "user-1" },
      ];

      prisma.devicePairing.findMany.mockResolvedValue(mockPairings);

      const result = await service.listPairings("bot-1", "PENDING" as any);
      expect(result).toEqual(mockPairings);
      expect(prisma.devicePairing.findMany).toHaveBeenCalledWith({
        where: { instanceId: "bot-1", state: "PENDING" },
        orderBy: { createdAt: "desc" },
      });
    });
  });

  describe("getPendingPairings", () => {
    it("returns only pending pairings", async () => {
      const mockPairings = [
        { id: "p1", instanceId: "bot-1", state: "PENDING", senderId: "user-1" },
      ];

      prisma.devicePairing.findMany.mockResolvedValue(mockPairings);

      const result = await service.getPendingPairings("bot-1");
      expect(result).toEqual(mockPairings);
      expect(prisma.devicePairing.findMany).toHaveBeenCalledWith({
        where: { instanceId: "bot-1", state: "PENDING" },
        orderBy: { createdAt: "desc" },
      });
    });
  });

  describe("approvePairing", () => {
    it("upserts a pairing to APPROVED state with approvedAt timestamp", async () => {
      const mockRecord = {
        id: "p1",
        instanceId: "bot-1",
        channelType: "WHATSAPP",
        senderId: "user-1",
        state: "APPROVED",
        approvedAt: expect.any(Date),
      };

      prisma.devicePairing.upsert.mockResolvedValue(mockRecord);

      const result = await service.approvePairing("bot-1", "WHATSAPP", "user-1");
      expect(result).toEqual(mockRecord);
      expect(prisma.devicePairing.upsert).toHaveBeenCalledWith({
        where: {
          instanceId_channelType_senderId: {
            instanceId: "bot-1",
            channelType: "WHATSAPP",
            senderId: "user-1",
          },
        },
        update: {
          state: "APPROVED",
          approvedAt: expect.any(Date),
        },
        create: {
          instanceId: "bot-1",
          channelType: "WHATSAPP",
          senderId: "user-1",
          state: "APPROVED",
          approvedAt: expect.any(Date),
        },
      });
    });

    it("calls configPatch on Gateway after approval", async () => {
      prisma.devicePairing.upsert.mockResolvedValue({
        id: "p1",
        instanceId: "bot-1",
        channelType: "WHATSAPP",
        senderId: "user-1",
        state: "APPROVED",
      });

      await service.approvePairing("bot-1", "WHATSAPP", "user-1");

      expect(mockConfigGet).toHaveBeenCalled();
      expect(mockConfigPatch).toHaveBeenCalledWith({
        patch: {
          channels: {
            whatsapp: {
              allowFrom: expect.arrayContaining(["existing-user", "user-1"]),
            },
          },
        },
        baseHash: "hash-123",
      });
    });

    it("still succeeds if Gateway sync fails", async () => {
      prisma.devicePairing.upsert.mockResolvedValue({
        id: "p1",
        instanceId: "bot-1",
        channelType: "WHATSAPP",
        senderId: "user-1",
        state: "APPROVED",
      });

      mockGetClient.mockRejectedValue(new Error("Gateway unreachable"));

      const result = await service.approvePairing("bot-1", "WHATSAPP", "user-1");
      expect(result.state).toBe("APPROVED");
    });
  });

  describe("rejectPairing", () => {
    it("rejects an existing pairing", async () => {
      const mockExisting = {
        id: "p1",
        instanceId: "bot-1",
        channelType: "WHATSAPP",
        senderId: "user-1",
        state: "PENDING",
      };

      prisma.devicePairing.findUnique.mockResolvedValue(mockExisting);
      prisma.devicePairing.update.mockResolvedValue({
        ...mockExisting,
        state: "REJECTED",
      });

      const result = await service.rejectPairing("bot-1", "WHATSAPP", "user-1");
      expect(result.state).toBe("REJECTED");
      expect(prisma.devicePairing.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: { state: "REJECTED" },
      });
    });

    it("throws NotFoundException when pairing does not exist", async () => {
      prisma.devicePairing.findUnique.mockResolvedValue(null);

      await expect(
        service.rejectPairing("bot-1", "WHATSAPP", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("batchApproveAll", () => {
    it("updates all pending pairings to approved and syncs to Gateway", async () => {
      const pendingPairings = [
        { channelType: "WHATSAPP", senderId: "user-1" },
        { channelType: "WHATSAPP", senderId: "user-2" },
        { channelType: "TELEGRAM", senderId: "user-3" },
      ];

      // findMany for fetching pending pairings before update
      prisma.devicePairing.findMany.mockResolvedValueOnce(pendingPairings);
      prisma.devicePairing.updateMany.mockResolvedValue({ count: 3 });
      // findMany for listPairings after sync (not called in batchApproveAll directly)

      const result = await service.batchApproveAll("bot-1");
      expect(result.count).toBe(3);
      expect(prisma.devicePairing.updateMany).toHaveBeenCalledWith({
        where: {
          instanceId: "bot-1",
          state: "PENDING",
        },
        data: {
          state: "APPROVED",
          approvedAt: expect.any(Date),
        },
      });

      // Should have called configPatch for each channel group
      expect(mockConfigPatch).toHaveBeenCalled();
    });

    it("returns count 0 when no pending pairings exist", async () => {
      prisma.devicePairing.findMany.mockResolvedValueOnce([]);
      prisma.devicePairing.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.batchApproveAll("bot-1");
      expect(result.count).toBe(0);
    });
  });

  describe("revokePairing", () => {
    it("revokes an approved pairing and syncs removal to Gateway", async () => {
      const mockExisting = {
        id: "p1",
        instanceId: "bot-1",
        channelType: "WHATSAPP",
        senderId: "existing-user",
        state: "APPROVED",
      };

      prisma.devicePairing.findUnique.mockResolvedValue(mockExisting);
      prisma.devicePairing.update.mockResolvedValue({
        ...mockExisting,
        state: "REVOKED",
        revokedAt: new Date(),
      });

      const result = await service.revokePairing("bot-1", "WHATSAPP", "existing-user");
      expect(result.state).toBe("REVOKED");

      // Should call configPatch to remove user from allowFrom
      expect(mockConfigPatch).toHaveBeenCalledWith({
        patch: {
          channels: {
            whatsapp: {
              allowFrom: [], // "existing-user" removed
            },
          },
        },
        baseHash: "hash-123",
      });
    });

    it("throws NotFoundException when pairing does not exist", async () => {
      prisma.devicePairing.findUnique.mockResolvedValue(null);

      await expect(
        service.revokePairing("bot-1", "DISCORD", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when pairing is not in APPROVED state", async () => {
      const mockExisting = {
        id: "p1",
        instanceId: "bot-1",
        channelType: "DISCORD",
        senderId: "user-1",
        state: "PENDING",
      };

      prisma.devicePairing.findUnique.mockResolvedValue(mockExisting);

      await expect(
        service.revokePairing("bot-1", "DISCORD", "user-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("syncPairingsFromGateway", () => {
    it("reads Gateway config and upserts approved pairings from allowFrom", async () => {
      mockConfigGet.mockResolvedValue({
        config: {
          channels: {
            whatsapp: { allowFrom: ["user-a", "user-b"] },
            telegram: { allowFrom: ["user-c"] },
          },
        },
        hash: "hash-456",
      });

      prisma.devicePairing.upsert.mockResolvedValue({});
      prisma.devicePairing.findMany.mockResolvedValue([]);

      await service.syncPairingsFromGateway("bot-1");

      // Should upsert for each senderId in each channel's allowFrom
      expect(prisma.devicePairing.upsert).toHaveBeenCalledTimes(3);
      expect(prisma.devicePairing.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            instanceId_channelType_senderId: {
              instanceId: "bot-1",
              channelType: "WHATSAPP",
              senderId: "user-a",
            },
          },
        }),
      );
    });

    it("handles Gateway unreachable gracefully", async () => {
      mockGetClient.mockRejectedValue(new Error("Connection refused"));
      prisma.devicePairing.findMany.mockResolvedValue([]);

      const result = await service.syncPairingsFromGateway("bot-1");
      expect(result).toEqual([]);
      // Should not throw
    });
  });

  describe("generatePairingCode", () => {
    it("generates an 8-character uppercase code", () => {
      const code = (service as any).generatePairingCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    });

    it("does not include ambiguous characters 0, O, 1, I", () => {
      // Generate many codes and verify none contain ambiguous chars
      for (let i = 0; i < 100; i++) {
        const code = (service as any).generatePairingCode();
        expect(code).not.toMatch(/[01OI]/);
      }
    });
  });

  describe("createPendingPairing", () => {
    it("creates a pending pairing with code and expiry", async () => {
      prisma.devicePairing.count.mockResolvedValue(0);
      prisma.devicePairing.upsert.mockResolvedValue({
        id: "p-new",
        instanceId: "bot-1",
        channelType: "WHATSAPP",
        senderId: "new-user",
        state: "PENDING",
        pairingCode: expect.any(String),
        expiresAt: expect.any(Date),
      });

      const result = await service.createPendingPairing("bot-1", "WHATSAPP", "new-user");
      expect(result.state).toBe("PENDING");
      expect(prisma.devicePairing.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            state: "PENDING",
            pairingCode: expect.any(String),
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });

    it("rejects when max 3 pending per channel is reached", async () => {
      prisma.devicePairing.count.mockResolvedValue(3);

      await expect(
        service.createPendingPairing("bot-1", "WHATSAPP", "new-user"),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createPendingPairing("bot-1", "WHATSAPP", "new-user"),
      ).rejects.toThrow("Maximum 3 pending pairing requests per channel");
    });

    it("allows creation when under the limit", async () => {
      prisma.devicePairing.count.mockResolvedValue(2);
      prisma.devicePairing.upsert.mockResolvedValue({
        id: "p-new",
        state: "PENDING",
      });

      await expect(
        service.createPendingPairing("bot-1", "WHATSAPP", "new-user"),
      ).resolves.toBeDefined();
    });
  });

  describe("findByCode", () => {
    it("finds a pending pairing by code", async () => {
      const futureDate = new Date(Date.now() + 3600000);
      prisma.devicePairing.findMany.mockResolvedValue([
        {
          id: "p1",
          instanceId: "bot-1",
          senderId: "user-1",
          channelType: "WHATSAPP",
          state: "PENDING",
          pairingCode: "ABCD1234",
          expiresAt: futureDate,
        },
      ]);

      const result = await service.findByCode("bot-1", "ABCD1234");
      expect(result).toBeDefined();
      expect(result!.senderId).toBe("user-1");
    });

    it("returns null when no matching code found", async () => {
      prisma.devicePairing.findMany.mockResolvedValue([]);

      const result = await service.findByCode("bot-1", "NOTEXIST");
      expect(result).toBeNull();
    });

    it("skips expired pairings", async () => {
      const pastDate = new Date(Date.now() - 3600000);
      prisma.devicePairing.findMany.mockResolvedValue([
        {
          id: "p1",
          instanceId: "bot-1",
          senderId: "user-1",
          state: "PENDING",
          pairingCode: "EXPIRED1",
          expiresAt: pastDate,
        },
      ]);

      const result = await service.findByCode("bot-1", "EXPIRED1");
      expect(result).toBeNull();
    });
  });

  describe("approveByCode", () => {
    it("approves a pairing found by code", async () => {
      const futureDate = new Date(Date.now() + 3600000);
      prisma.devicePairing.findMany.mockResolvedValue([
        {
          id: "p1",
          instanceId: "bot-1",
          senderId: "user-1",
          channelType: "WHATSAPP",
          state: "PENDING",
          pairingCode: "VALIDCOD",
          expiresAt: futureDate,
        },
      ]);
      prisma.devicePairing.upsert.mockResolvedValue({
        id: "p1",
        instanceId: "bot-1",
        senderId: "user-1",
        channelType: "WHATSAPP",
        state: "APPROVED",
        approvedAt: new Date(),
      });

      const result = await service.approveByCode("bot-1", "VALIDCOD");
      expect(result.state).toBe("APPROVED");
    });

    it("throws NotFoundException when code not found", async () => {
      prisma.devicePairing.findMany.mockResolvedValue([]);

      await expect(
        service.approveByCode("bot-1", "BADCODE1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("expireStale", () => {
    it("expires pending pairings past their expiresAt", async () => {
      prisma.devicePairing.updateMany.mockResolvedValue({ count: 2 });

      const count = await service.expireStale();
      expect(count).toBe(2);
      expect(prisma.devicePairing.updateMany).toHaveBeenCalledWith({
        where: {
          state: "PENDING",
          expiresAt: { lt: expect.any(Date) },
        },
        data: {
          state: "EXPIRED",
        },
      });
    });

    it("returns 0 when no stale pairings exist", async () => {
      prisma.devicePairing.updateMany.mockResolvedValue({ count: 0 });

      const count = await service.expireStale();
      expect(count).toBe(0);
    });
  });
});
