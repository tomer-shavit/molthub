import { Test, TestingModule } from "@nestjs/testing";
import { AgentEvolutionService } from "../agent-evolution.service";

// Mock prisma
jest.mock("@clawster/database", () => ({
  prisma: {
    botInstance: {
      findUnique: jest.fn(),
    },
    gatewayConnection: {
      findUnique: jest.fn(),
    },
    agentStateSnapshot: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
  BotStatus: {
    RUNNING: "RUNNING",
    DEGRADED: "DEGRADED",
  },
  GatewayConnectionStatus: {
    CONNECTED: "CONNECTED",
    DISCONNECTED: "DISCONNECTED",
  },
}));

// Mock gateway-client
const mockGetClient = jest.fn();
jest.mock("@clawster/gateway-client", () => ({
  GatewayManager: jest.fn().mockImplementation(() => ({
    getClient: mockGetClient,
  })),
}));

const { prisma } = require("@clawster/database");

describe("AgentEvolutionService", () => {
  let service: AgentEvolutionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentEvolutionService],
    }).compile();

    service = module.get<AgentEvolutionService>(AgentEvolutionService);
    jest.clearAllMocks();
  });

  describe("getLatestSnapshot", () => {
    it("returns the most recent snapshot", async () => {
      const mockSnapshot = {
        id: "snap-1",
        instanceId: "bot-1",
        hasEvolved: true,
        totalChanges: 3,
        capturedAt: new Date(),
      };

      prisma.agentStateSnapshot.findFirst.mockResolvedValue(mockSnapshot);

      const result = await service.getLatestSnapshot("bot-1");
      expect(result).toEqual(mockSnapshot);
      expect(prisma.agentStateSnapshot.findFirst).toHaveBeenCalledWith({
        where: { instanceId: "bot-1" },
        orderBy: { capturedAt: "desc" },
      });
    });

    it("returns null when no snapshots exist", async () => {
      prisma.agentStateSnapshot.findFirst.mockResolvedValue(null);
      const result = await service.getLatestSnapshot("bot-1");
      expect(result).toBeNull();
    });
  });

  describe("getEvolutionHistory", () => {
    it("returns recent snapshots", async () => {
      const mockSnapshots = [
        { id: "snap-1", hasEvolved: true },
        { id: "snap-2", hasEvolved: false },
      ];

      prisma.agentStateSnapshot.findMany.mockResolvedValue(mockSnapshots);

      const result = await service.getEvolutionHistory("bot-1", 10);
      expect(result).toEqual(mockSnapshots);
      expect(prisma.agentStateSnapshot.findMany).toHaveBeenCalledWith({
        where: { instanceId: "bot-1" },
        orderBy: { capturedAt: "desc" },
        take: 10,
      });
    });
  });

  describe("cleanupOldSnapshots", () => {
    it("deletes snapshots older than specified days", async () => {
      prisma.agentStateSnapshot.deleteMany.mockResolvedValue({ count: 15 });

      const result = await service.cleanupOldSnapshots(7);
      expect(result).toBe(15);
      expect(prisma.agentStateSnapshot.deleteMany).toHaveBeenCalled();
    });
  });

  describe("captureState", () => {
    it("throws when instance not found", async () => {
      prisma.botInstance.findUnique.mockResolvedValue(null);
      await expect(service.captureState("nonexistent")).rejects.toThrow("not found");
    });

    it("creates snapshot with gatewayReachable=false when gateway unreachable", async () => {
      prisma.botInstance.findUnique.mockResolvedValue({
        id: "bot-1",
        desiredManifest: { spec: { openclawConfig: {} } },
        gatewayPort: 18789,
      });
      prisma.gatewayConnection.findUnique.mockResolvedValue(null);
      mockGetClient.mockRejectedValue(new Error("Connection refused"));
      prisma.agentStateSnapshot.create.mockResolvedValue({
        id: "snap-1",
        gatewayReachable: false,
        hasEvolved: false,
      });

      const result = await service.captureState("bot-1");
      expect(prisma.agentStateSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            instanceId: "bot-1",
            gatewayReachable: false,
            hasEvolved: false,
          }),
        }),
      );
    });
  });
});
