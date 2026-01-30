import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PairingService } from "../pairing.service";

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
    },
    botInstance: {
      findFirst: jest.fn(),
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

    it("creates a new record if pairing does not exist (upsert behavior)", async () => {
      const mockCreated = {
        id: "p-new",
        instanceId: "bot-1",
        channelType: "TELEGRAM",
        senderId: "new-user",
        state: "APPROVED",
        approvedAt: new Date(),
      };

      prisma.devicePairing.upsert.mockResolvedValue(mockCreated);

      const result = await service.approvePairing("bot-1", "TELEGRAM", "new-user");
      expect(result.state).toBe("APPROVED");
      expect(prisma.devicePairing.upsert).toHaveBeenCalled();
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
    it("updates all pending pairings to approved", async () => {
      prisma.devicePairing.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.batchApproveAll("bot-1");
      expect(result.count).toBe(5);
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
    });

    it("returns count 0 when no pending pairings exist", async () => {
      prisma.devicePairing.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.batchApproveAll("bot-1");
      expect(result.count).toBe(0);
    });
  });

  describe("revokePairing", () => {
    it("revokes an approved pairing and sets revokedAt", async () => {
      const mockExisting = {
        id: "p1",
        instanceId: "bot-1",
        channelType: "DISCORD",
        senderId: "user-1",
        state: "APPROVED",
      };

      prisma.devicePairing.findUnique.mockResolvedValue(mockExisting);
      prisma.devicePairing.update.mockResolvedValue({
        ...mockExisting,
        state: "REVOKED",
        revokedAt: new Date(),
      });

      const result = await service.revokePairing("bot-1", "DISCORD", "user-1");
      expect(result.state).toBe("REVOKED");
      expect(prisma.devicePairing.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: {
          state: "REVOKED",
          revokedAt: expect.any(Date),
        },
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
    it("returns current DB pairings as placeholder", async () => {
      const mockPairings = [
        { id: "p1", instanceId: "bot-1", state: "APPROVED" },
      ];

      prisma.devicePairing.findMany.mockResolvedValue(mockPairings);

      const result = await service.syncPairingsFromGateway("bot-1");
      expect(result).toEqual(mockPairings);
    });
  });
});
